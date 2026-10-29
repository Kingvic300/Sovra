import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { ArrowUp } from "lucide-react";
import { Logo } from "./logo";

/** Desktop top bar composer. Sends the question to the Ask page, which asks it straight away. "/" focuses it. */
export function AskBar() {
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return;
      e.preventDefault();
      input.current?.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const question = draft.trim();
    setDraft("");
    input.current?.blur();
    navigate(question ? `/app/ask?q=${encodeURIComponent(question)}` : "/app/ask");
  }

  return (
    <form
      onSubmit={onSubmit}
      role="search"
      aria-label="Ask Sovra"
      className="group flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-full border border-field/60 bg-card py-1 pr-1 pl-3 shadow-card transition-colors focus-within:border-cobalt focus-within:ring-4 focus-within:ring-cobalt/20 hover:border-cobalt md:max-w-[520px]"
    >
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-cobalt-soft">
        <Logo className="size-4" />
      </span>
      <label htmlFor="ask-bar" className="sr-only">
        Ask Sovra about your money
      </label>
      <input
        ref={input}
        id="ask-bar"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && (setDraft(""), input.current?.blur())}
        placeholder="Ask Sovra about your money"
        autoComplete="off"
        enterKeyHint="send"
        className="h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted"
      />
      {draft.trim() ? (
        <button
          type="submit"
          aria-label="Ask"
          className="grid size-9 shrink-0 place-items-center rounded-full bg-cobalt text-white transition-colors hover:bg-cobalt-deep"
        >
          <ArrowUp className="size-4" aria-hidden />
        </button>
      ) : (
        <kbd className="mr-2 grid h-6 min-w-6 place-items-center rounded-md border border-line bg-porcelain px-1.5 font-sans text-[12px] text-muted" title="Press / to ask">
          /
        </kbd>
      )}
    </form>
  );
}
