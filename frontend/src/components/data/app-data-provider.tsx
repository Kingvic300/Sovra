import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AppDataContext, INITIAL_DATA, type AppData, type AppDataApi, type NewMemory } from "@/lib/app-data";
import { TODAY } from "@/lib/demo-data";

const STORAGE_KEY = "sovra.data.v1";

function load(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...INITIAL_DATA, ...(JSON.parse(raw) as Partial<AppData>) } : INITIAL_DATA;
  } catch {
    return INITIAL_DATA;
  }
}

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(load);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

  const addMemory = useCallback((m: NewMemory) => {
    const id = `m-${Date.now().toString(36)}`;
    setData((d) => ({ ...d, memories: [...d.memories, { id, date: TODAY, uses: 0, ...m }] }));
    return id;
  }, []);

  const removeMemory = useCallback((id: string) => {
    setData((d) => ({ ...d, memories: d.memories.filter((m) => m.id !== id) }));
  }, []);

  const restoreMemory = useCallback<AppDataApi["restoreMemory"]>((m, index) => {
    setData((d) =>
      d.memories.some((x) => x.id === m.id)
        ? d
        : { ...d, memories: [...d.memories.slice(0, index), m, ...d.memories.slice(index)] },
    );
  }, []);

  const setRecurringStatus = useCallback<AppDataApi["setRecurringStatus"]>((id, status) => {
    setData((d) => ({ ...d, recurring: d.recurring.map((r) => (r.id === id ? { ...r, status } : r)) }));
  }, []);

  const upsertBudget = useCallback<AppDataApi["upsertBudget"]>((b) => {
    setData((d) => {
      const exists = d.budgets.some((x) => x.category === b.category);
      return { ...d, budgets: exists ? d.budgets.map((x) => (x.category === b.category ? b : x)) : [...d.budgets, b] };
    });
  }, []);

  const markAnswered = useCallback<AppDataApi["markAnswered"]>((insightId, answered) => {
    setData((d) => ({
      ...d,
      answered: answered ? [...new Set([...d.answered, insightId])] : d.answered.filter((x) => x !== insightId),
    }));
  }, []);

  const reset = useCallback(() => setData(INITIAL_DATA), []);

  const api = useMemo<AppDataApi>(
    () => ({ data, addMemory, removeMemory, restoreMemory, setRecurringStatus, upsertBudget, markAnswered, reset }),
    [data, addMemory, removeMemory, restoreMemory, setRecurringStatus, upsertBudget, markAnswered, reset],
  );

  return <AppDataContext.Provider value={api}>{children}</AppDataContext.Provider>;
}
