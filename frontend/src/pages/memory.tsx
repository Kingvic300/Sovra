import { MemoryList } from "@/components/memory/memory-list";
import { PageHeader } from "@/components/ui/page-header";
import { memoryCount, useAppData } from "@/lib/app-data";
import { useTitle } from "@/lib/use-title";

export default function MemoryPage() {
  useTitle("Memory");
  const { data } = useAppData();
  const uses = data.memories.reduce((s, m) => s + m.uses, 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="What Sovra remembers"
        description="Goals, limits, corrections and decisions Sovra learned from you. They live in your Walrus vault, so they carry across sessions and devices. Forget anything at any time."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Memories in your vault", value: String(memoryCount(data)) },
          { label: "Times used in advice this month", value: String(uses) },
          { label: "Stored on", value: "Walrus mainnet" },
        ].map((s) => (
          <div key={s.label} className="rounded-card bg-card px-5 py-4 shadow-card">
            <p className="text-[13px] text-muted">{s.label}</p>
            <p className="mt-0.5 text-2xl font-extrabold tracking-[-0.02em] tabular-nums">{s.value}</p>
          </div>
        ))}
      </div>

      <MemoryList />
    </div>
  );
}
