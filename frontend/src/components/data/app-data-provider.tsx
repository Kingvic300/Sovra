import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, ApiError } from "@/lib/api";
import {
  AppDataContext,
  SAMPLE_DATA,
  liveMonthNet,
  monthEndOf,
  nextPayday,
  type AppData,
  type AppDataApi,
  type MemoryOutcome,
  type NewMemory,
} from "@/lib/app-data";
import { useAuth } from "@/lib/auth-context";
import { NoDatabaseError, loadLiveData, type ApiMemory } from "@/lib/backend";
import { CATEGORIES } from "@/lib/demo-data";
import { useToast } from "@/lib/toast-context";

const SAMPLE_KEY = "sovra.data.v2";
/** Per address: what the user paused in Sovra and which insights they answered. The backend doesn't keep these. */
const localKey = (address: string) => `sovra.local.${address}`;

/** The parts of the sample story a visitor can change. */
const SAMPLE_SAVED = ["budgets", "goals", "recurring", "memories", "transactions", "answered"] as const;

function loadSample(): AppData {
  try {
    const raw = localStorage.getItem(SAMPLE_KEY);
    return raw ? { ...SAMPLE_DATA, ...(JSON.parse(raw) as Partial<AppData>), source: "sample" } : SAMPLE_DATA;
  } catch {
    return SAMPLE_DATA;
  }
}

type LocalState = { paused: string[]; answered: string[] };

function readLocal(address: string): LocalState {
  try {
    const raw = localStorage.getItem(localKey(address));
    return raw ? { paused: [], answered: [], ...(JSON.parse(raw) as Partial<LocalState>) } : { paused: [], answered: [] };
  } catch {
    return { paused: [], answered: [] };
  }
}

/** Today in the user's time zone, as YYYY-MM-DD. */
const localToday = () => new Date().toLocaleDateString("en-CA");

/** The signed-in user's data, or "failed" when it couldn't be loaded and the sample story shows instead. */
type Loaded = { address: string; data: AppData | "failed" };

const tempId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function AppDataProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const toast = useToast();
  const [sample, setSample] = useState<AppData>(loadSample);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const address = auth.session?.address ?? null;
  const verified = auth.server === "verified";
  const payday = auth.profile?.payday;

  const current = verified && loaded?.address === address ? loaded.data : null;
  const live = current !== null && current !== "failed";
  const waiting = (verified && current === null) || auth.server === "checking";
  const data = useMemo<AppData>(
    () => (live ? current : waiting ? { ...sample, source: "loading" } : sample),
    [live, current, waiting, sample],
  );

  // Mutations read this without being re-created on every render.
  const liveRef = useRef(live);
  useLayoutEffect(() => {
    liveRef.current = live;
  }, [live]);
  /** Temporary ids of rows being created on the server, resolved to their server ids. */
  const pending = useRef(new Map<string, Promise<string | null>>());
  /** Bumped on each load so a slow response can't overwrite a newer one. */
  const generation = useRef(0);

  /** Applies a change to whichever data is on screen. */
  const setData = useCallback((change: (d: AppData) => AppData) => {
    if (!liveRef.current) return setSample(change);
    setLoaded((l) => (l && l.data !== "failed" ? { ...l, data: change(l.data) } : l));
  }, []);

  const fail = useCallback(
    (title: string, err: unknown) => {
      toast.error({ title, description: err instanceof ApiError ? err.message : "Try again in a moment." });
    },
    [toast],
  );

  /** Fetches the user's data and returns how to apply it, or null when a newer load started meanwhile. */
  const fetchLive = useCallback(async (): Promise<((l: Loaded | null) => Loaded) | null> => {
    if (!address) return null;
    const run = ++generation.current;
    const today = localToday();
    const local = readLocal(address);
    try {
      const fetched = await loadLiveData(today, new Set(local.paused));
      if (run !== generation.current) return null;
      const base = { ...fetched, today, monthEnd: monthEndOf(today), payday: nextPayday(today, payday) };
      const data: AppData = { ...base, source: "live", hiddenMemories: 0, monthNet: liveMonthNet(base), answered: local.answered };
      return () => ({ address, data });
    } catch (err) {
      if (run !== generation.current) return null;
      if (!(err instanceof NoDatabaseError)) fail("Couldn't load your data", err);
      // Keep what is on screen after a failed refresh; fall back to the sample story on first load.
      return (l) => (l?.address === address && l.data !== "failed" ? l : { address, data: "failed" });
    }
  }, [address, payday, fail]);

  const load = useCallback(async () => {
    const apply = await fetchLive();
    if (apply) setLoaded(apply);
  }, [fetchLive]);

  useEffect(() => {
    if (!verified) {
      generation.current++;
      return;
    }
    void fetchLive().then((apply) => apply && setLoaded(apply));
  }, [verified, fetchLive]);

  // Sample changes stay in this browser. Live data stays on the server, except pauses and answers.
  useEffect(() => {
    const saved = Object.fromEntries(SAMPLE_SAVED.map((k) => [k, sample[k]]));
    localStorage.setItem(SAMPLE_KEY, JSON.stringify(saved));
  }, [sample]);

  useEffect(() => {
    if (!loaded || loaded.data === "failed") return;
    const paused = loaded.data.recurring.filter((r) => r.status === "paused").map((r) => r.id);
    localStorage.setItem(localKey(loaded.address), JSON.stringify({ paused, answered: loaded.data.answered } satisfies LocalState));
  }, [loaded]);

  const reload = useCallback(() => (liveRef.current ? load() : Promise.resolve()), [load]);

  /** Server id for a row, waiting for it if the row is still being created. */
  const serverId = useCallback((id: string) => pending.current.get(id) ?? Promise.resolve(id), []);

  /** Creates a memory on the server and swaps the temporary id for the real one. */
  const createMemory = useCallback(
    (id: string, m: Pick<NewMemory, "kind" | "text" | "source">) => {
      const created = api<{ memory: ApiMemory }>("/memories", { method: "POST", json: { kind: m.kind, text: m.text, source: m.source } })
        .then(({ memory }) => {
          setData((d) => ({ ...d, memories: d.memories.map((x) => (x.id === id ? { ...x, id: memory.id } : x)) }));
          return memory.id;
        })
        .catch((err: unknown) => {
          setData((d) => ({ ...d, memories: d.memories.filter((x) => x.id !== id) }));
          fail("Couldn't save that to memory", err);
          return null;
        });
      pending.current.set(id, created);
    },
    [fail, setData],
  );

  const addMemory = useCallback<AppDataApi["addMemory"]>(
    (m) => {
      const id = tempId("m");
      setData((d) => ({ ...d, memories: [...d.memories, { id, date: d.today, uses: 0, ...m }] }));
      if (liveRef.current) createMemory(id, m);
      return id;
    },
    [createMemory, setData],
  );

  const removeMemory = useCallback<AppDataApi["removeMemory"]>(
    (id) => {
      setData((d) => ({ ...d, memories: d.memories.filter((m) => m.id !== id) }));
      if (!liveRef.current) return;
      void serverId(id).then((real) => {
        if (!real) return;
        setData((d) => ({ ...d, memories: d.memories.filter((m) => m.id !== real) }));
        api(`/memories/${real}`, { method: "DELETE" }).catch((err: unknown) => {
          fail("Couldn't forget that memory", err);
          void reload();
        });
      });
    },
    [serverId, fail, reload, setData],
  );

  // The backend can't un-forget, so an undone forget is remembered again as a new memory.
  const restoreMemory = useCallback<AppDataApi["restoreMemory"]>(
    (m, index) => {
      const restored = liveRef.current ? { ...m, id: tempId("m") } : m;
      setData((d) =>
        d.memories.some((x) => x.id === restored.id)
          ? d
          : { ...d, memories: [...d.memories.slice(0, index), restored, ...d.memories.slice(index)] },
      );
      if (liveRef.current) createMemory(restored.id, m);
    },
    [createMemory, setData],
  );

  const setRecurringStatus = useCallback<AppDataApi["setRecurringStatus"]>((id, status) => {
    setData((d) => ({ ...d, recurring: d.recurring.map((r) => (r.id === id ? { ...r, status } : r)) }));
  }, [setData]);

  const upsertBudget = useCallback<AppDataApi["upsertBudget"]>(
    (b) => {
      setData((d) => {
        const exists = d.budgets.some((x) => x.category === b.category);
        return { ...d, budgets: exists ? d.budgets.map((x) => (x.category === b.category ? b : x)) : [...d.budgets, b] };
      });
      if (!liveRef.current) return;
      api(`/budgets/${b.category}`, { method: "PUT", json: { limit: b.limit } }).catch((err: unknown) => {
        fail(`Couldn't save the ${CATEGORIES[b.category].toLowerCase()} budget`, err);
        void reload();
      });
    },
    [fail, reload, setData],
  );

  const addGoal = useCallback<AppDataApi["addGoal"]>(
    (g) => {
      const id = tempId("g");
      setData((d) => ({ ...d, goals: [...d.goals, { id, ...g }] }));
      if (!liveRef.current) return id;
      const created = api<{ id: string }>("/goals", {
        method: "POST",
        json: { name: g.name, target: g.target, saved: g.saved, due: g.due, weekly: g.weekly },
      })
        .then(({ id: real }) => {
          setData((d) => ({ ...d, goals: d.goals.map((x) => (x.id === id ? { ...x, id: real } : x)) }));
          return real;
        })
        .catch((err: unknown) => {
          setData((d) => ({ ...d, goals: d.goals.filter((x) => x.id !== id) }));
          fail("Couldn't save the goal", err);
          return null;
        });
      pending.current.set(id, created);
      return id;
    },
    [fail, setData],
  );

  const removeGoal = useCallback<AppDataApi["removeGoal"]>(
    (id) => {
      setData((d) => ({ ...d, goals: d.goals.filter((g) => g.id !== id) }));
      if (!liveRef.current) return;
      void serverId(id).then((real) => {
        if (!real) return;
        setData((d) => ({ ...d, goals: d.goals.filter((g) => g.id !== real) }));
        api(`/goals/${real}`, { method: "DELETE" }).catch((err: unknown) => {
          fail("Couldn't remove the goal", err);
          void reload();
        });
      });
    },
    [serverId, fail, reload, setData],
  );

  const recategorize = useCallback<AppDataApi["recategorize"]>(
    (txId, category) => {
      setData((d) => ({
        ...d,
        transactions: d.transactions.map((t) => (t.id === txId ? { ...t, category, learnedFrom: undefined } : t)),
      }));
      if (!liveRef.current) return;
      api(`/transactions/${txId}`, { method: "PATCH", json: { category, remember: false } })
        // Budgets count spending by category, so they change too.
        .then(() => reload())
        .catch((err: unknown) => {
          fail("Couldn't change the category", err);
          void reload();
        });
    },
    [fail, reload, setData],
  );

  const rememberCategory = useCallback<AppDataApi["rememberCategory"]>(
    async (txId, merchant, category) => {
      const label = CATEGORIES[category].toLowerCase();
      if (!liveRef.current) {
        setData((d) => ({
          ...d,
          transactions: d.transactions.map((t) => (t.merchant === merchant ? { ...t, category, learnedFrom: "new" } : t)),
        }));
        addMemory({ kind: "correction", text: `${merchant} transactions are ${label}.`, highlight: label, source: "You edited a transaction" });
        return "saved";
      }
      // The server matches the merchant the same way imports do, recategorizes and writes the memory.
      const { memory } = await api<{ memory: { status: MemoryOutcome } }>(`/transactions/${txId}`, {
        method: "PATCH",
        json: { category, remember: true },
      });
      await reload();
      return memory.status;
    },
    [addMemory, reload, setData],
  );

  const markAnswered = useCallback<AppDataApi["markAnswered"]>((insightId, answered) => {
    setData((d) => ({
      ...d,
      answered: answered ? [...new Set([...d.answered, insightId])] : d.answered.filter((x) => x !== insightId),
    }));
  }, [setData]);

  const reset = useCallback(() => {
    if (liveRef.current) void reload();
    else setSample(SAMPLE_DATA);
  }, [reload]);

  const value = useMemo<AppDataApi>(
    () => ({
      data,
      reload,
      addMemory,
      removeMemory,
      restoreMemory,
      setRecurringStatus,
      upsertBudget,
      addGoal,
      removeGoal,
      recategorize,
      rememberCategory,
      markAnswered,
      reset,
    }),
    [data, reload, addMemory, removeMemory, restoreMemory, setRecurringStatus, upsertBudget, addGoal, removeGoal, recategorize, rememberCategory, markAnswered, reset],
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}
