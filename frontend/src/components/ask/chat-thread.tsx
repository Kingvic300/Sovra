import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { ArrowUp } from "lucide-react";
import { Logo } from "@/components/shell/logo";
import { Remembered } from "@/components/ui/remembered";
import { api, ApiError } from "@/lib/api";
import { useAppData } from "@/lib/app-data";
import { toChat, type ApiAskMessage } from "@/lib/backend";
import type { ChatMessage } from "@/lib/demo-data";
import { highlightFor } from "@/lib/highlight";
import { useToast } from "@/lib/toast-context";

const SUGGESTIONS = [
  "Why am I spending more than usual?",
  "How much can I realistically save this month?",
  "What renews in the next two weeks?",
];

export function ChatThread({ initial }: { initial: ChatMessage[] }) {
  const [messages, setMessages] = useState(initial);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const toast = useToast();
  const { data, reload } = useAppData();
  const [params, setParams] = useSearchParams();
  const askedFromUrl = useRef(false);

  async function send(text: string) {
    const question = text.trim();
    if (!question || thinking) return;
    const asked: ChatMessage = { id: `pending-${messages.length}`, role: "user", text: question };
    setMessages((prev) => [...prev, asked]);
    setDraft("");
    if (data.source !== "live") {
      toast.info({
        title: "Sign in to ask Sovra",
        description: "Answers use your own numbers and memories, so they need a signed-in account.",
      });
      return;
    }
    setThinking(true);
    try {
      const res = await api<Omit<ApiAskMessage, "question">>("/ask", { method: "POST", json: { question } });
      // Swap the pending question for the saved pair, so ids match the history.
      setMessages((prev) => [...prev.filter((m) => m.id !== asked.id), ...toChat({ ...res, question }, prev.length)]);
      // Recall bumps each memory's use count.
      void reload();
    } catch (e) {
      setMessages((prev) => prev.filter((m) => m.id !== asked.id));
      setDraft(question);
      toast.error({ title: "Sovra couldn't answer", description: e instanceof ApiError ? e.message : "Try again in a moment." });
    } finally {
      setThinking(false);
    }
  }

  // A question typed in the top bar arrives as ?q= and is asked once.
  useEffect(() => {
    const q = params.get("q");
    if (!q || askedFromUrl.current) return;
    askedFromUrl.current = true;
    setParams({}, { replace: true });
    void send(q);
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void send(draft);
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-card bg-card shadow-card">
      <ol className="flex flex-col gap-6 px-5 py-6 sm:px-8" aria-live="polite">
        {messages.map((m) =>
          m.role === "user" ? (
            <li key={m.id} className="max-w-[80%] self-end rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-white">
              {m.text}
            </li>
          ) : (
            <li key={m.id} className="flex max-w-[68ch] gap-3">
              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-cobalt-soft">
                <Logo className="size-4 text-cobalt" />
              </span>
              <div>
                <p className="text-[16px] leading-relaxed">{m.text}</p>
                {m.usedMemories && (
                  <div className="mt-3 rounded-lg bg-porcelain px-3.5 py-2.5 text-[13px]">
                    <p className="mb-1 font-semibold text-muted">Based on what you told Sovra</p>
                    <ul className="flex flex-col gap-1">
                      {m.usedMemories.map((mem, i) => (
                        <li key={mem.id ?? i}>
                          <Remembered text={mem.text} highlight={highlightFor(mem.text)} />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </li>
          ),
        )}
        {thinking && (
          <li className="flex gap-3 text-muted">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-cobalt-soft">
              <Logo className="size-4 animate-pulse text-cobalt motion-reduce:animate-none" />
            </span>
            <p className="pt-1">Checking your numbers and what Sovra remembers…</p>
          </li>
        )}
        {messages.length === 0 && !thinking && (
          <li className="text-muted">Ask about a purchase, a bill or a goal. Sovra answers from your own numbers.</li>
        )}
      </ol>

      <div className="border-t border-line bg-porcelain/40 px-5 py-4 sm:px-8">
        <div className="mb-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => void send(s)}
              disabled={thinking}
              className="rounded-full border border-line bg-card px-3 py-1.5 text-[13px] text-muted transition-colors hover:border-cobalt/40 hover:text-ink"
            >
              {s}
            </button>
          ))}
        </div>
        <form onSubmit={onSubmit} className="flex items-center gap-2 rounded-full border border-field bg-card py-1.5 pr-1.5 pl-5 focus-within:border-cobalt focus-within:ring-4 focus-within:ring-cobalt/20">
          <label htmlFor="ask" className="sr-only">
            Ask Sovra
          </label>
          <input
            id="ask"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask about your money"
            className="h-9 flex-1 bg-transparent outline-none placeholder:text-muted"
            autoComplete="off"
          />
          <button
            type="submit"
            aria-label="Send"
            disabled={!draft.trim() || thinking}
            className="grid size-9 place-items-center rounded-full bg-cobalt text-white transition-colors hover:bg-cobalt-deep disabled:opacity-40"
          >
            <ArrowUp className="size-4" aria-hidden />
          </button>
        </form>
      </div>
    </div>
  );
}
