import { useState, type FormEvent } from "react";
import { ArrowUp } from "lucide-react";
import { Logo } from "@/components/shell/logo";
import { Remembered } from "@/components/ui/remembered";
import { memoryById, type ChatMessage } from "@/lib/demo-data";
import { useToast } from "@/lib/toast-context";

const SUGGESTIONS = [
  "Why am I spending more than usual?",
  "How much can I realistically save this month?",
  "What renews in the next two weeks?",
];

export function ChatThread({ initial }: { initial: ChatMessage[] }) {
  const [messages, setMessages] = useState(initial);
  const [draft, setDraft] = useState("");
  const toast = useToast();

  function send(text: string) {
    const question = text.trim();
    if (!question) return;
    // The assistant is not wired yet; questions are queued in the thread.
    setMessages((prev) => [...prev, { id: `u${prev.length}`, role: "user", text: question }]);
    setDraft("");
    toast.info({
      title: "Ask Sovra isn't connected yet",
      description: "Your question stays in the thread. Answers start once the AI provider is switched on.",
    });
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    send(draft);
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
                      {m.usedMemories.map((id) => {
                        const mem = memoryById(id);
                        return mem ? (
                          <li key={id}>
                            <Remembered text={mem.text} highlight={mem.highlight} />
                          </li>
                        ) : null;
                      })}
                    </ul>
                  </div>
                )}
              </div>
            </li>
          ),
        )}
      </ol>

      <div className="border-t border-line bg-porcelain/40 px-5 py-4 sm:px-8">
        <div className="mb-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => send(s)}
              className="rounded-full border border-line bg-card px-3 py-1.5 text-[13px] text-muted transition-colors hover:border-cobalt/40 hover:text-ink"
            >
              {s}
            </button>
          ))}
        </div>
        <form onSubmit={onSubmit} className="flex items-center gap-2 rounded-full border border-line bg-card py-1.5 pr-1.5 pl-5 focus-within:border-cobalt">
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
            disabled={!draft.trim()}
            className="grid size-9 place-items-center rounded-full bg-cobalt text-white transition-colors hover:bg-cobalt-deep disabled:opacity-40"
          >
            <ArrowUp className="size-4" aria-hidden />
          </button>
        </form>
      </div>
    </div>
  );
}
