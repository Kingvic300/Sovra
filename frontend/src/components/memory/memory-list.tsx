import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Remembered } from "@/components/ui/remembered";
import { useAppData } from "@/lib/app-data";
import { MEMORY_KINDS, type Memory, type MemoryKind } from "@/lib/demo-data";
import { shortDate } from "@/lib/format";
import { useToast } from "@/lib/toast-context";

export function MemoryList() {
  const { data, removeMemory, restoreMemory } = useAppData();
  const items = [...data.memories].sort((a, b) => b.date.localeCompare(a.date));
  const [kind, setKind] = useState<MemoryKind | "all">("all");
  const [confirming, setConfirming] = useState<string | null>(null);
  const toast = useToast();

  function forget(m: Memory) {
    const index = data.memories.findIndex((x) => x.id === m.id);
    removeMemory(m.id);
    setConfirming(null);
    toast.success({
      title: "Memory forgotten",
      description: "Sovra won't use it in advice any more.",
      action: {
        label: "Undo",
        onClick: () => restoreMemory(m, index),
      },
    });
  }

  const kinds = (Object.keys(MEMORY_KINDS) as MemoryKind[]).filter((k) => items.some((m) => m.kind === k));
  const visible = items.filter((m) => kind === "all" || m.kind === kind);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter memories">
        {(["all", ...kinds] as const).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={kind === k}
            onClick={() => setKind(k)}
            className={`h-8 rounded-full px-3 text-[13px] font-medium transition-colors ${
              kind === k ? "bg-ink text-white" : "bg-card text-muted hover:text-ink"
            }`}
          >
            {k === "all" ? "All" : MEMORY_KINDS[k]}
          </button>
        ))}
      </div>

      <ul className="overflow-hidden rounded-card bg-card shadow-card">
        {visible.map((m) => (
          <li
            key={m.id}
            className="grid gap-3 border-t border-line px-5 py-4 first:border-t-0 sm:grid-cols-[64px_1fr_auto] sm:items-start"
          >
            <span className="text-[13px] tabular-nums text-muted sm:pt-0.5">{shortDate(m.date)}</span>
            <div>
              <p className="text-[16px]">
                <Remembered text={m.text} highlight={m.highlight} />
              </p>
              <p className="mt-1 text-[13px] text-muted">
                {m.source}. Used {m.uses} {m.uses === 1 ? "time" : "times"} in advice.
              </p>
            </div>
            {confirming === m.id ? (
              <div className="flex items-center gap-2 text-[13px]">
                <span className="text-muted">Forget this?</span>
                <button
                  type="button"
                  onClick={() => forget(m)}
                  className="font-semibold text-over hover:underline"
                >
                  Forget
                </button>
                <button type="button" onClick={() => setConfirming(null)} className="font-semibold text-muted hover:text-ink">
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(m.id)}
                aria-label={`Forget: ${m.text}`}
                className="justify-self-start rounded-md p-1.5 text-muted transition-colors hover:bg-over-soft hover:text-over sm:justify-self-end"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            )}
          </li>
        ))}
        {visible.length === 0 && (
          <li className="px-5 py-10 text-center text-muted">
            Nothing here yet. Sovra adds memories when you set a goal, edit a category or answer a suggestion.
          </li>
        )}
      </ul>
    </div>
  );
}
