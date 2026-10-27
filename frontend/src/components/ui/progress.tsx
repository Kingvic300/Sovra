export type Tone = "gain" | "caution" | "over" | "cobalt";

const FILL: Record<Tone, string> = {
  gain: "bg-gain",
  caution: "bg-caution",
  over: "bg-over",
  cobalt: "bg-cobalt",
};

/**
 * Horizontal meter. `committed` draws a hatched segment for money that is
 * scheduled but not yet spent; anything past `max` is clipped at the end.
 */
export function Progress({
  value,
  max,
  committed = 0,
  tone = "gain",
  size = "md",
  label,
}: {
  value: number;
  max: number;
  committed?: number;
  tone?: Tone;
  size?: "md" | "lg";
  label: string;
}) {
  const spentPct = Math.min(100, (value / max) * 100);
  const committedPct = Math.min(100 - spentPct, (committed / max) * 100);
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={`relative overflow-hidden rounded-full bg-track ${size === "lg" ? "h-2.5" : "h-2"}`}
    >
      <div className={`absolute inset-y-0 left-0 rounded-full ${FILL[tone]}`} style={{ width: `${spentPct}%` }} />
      {committedPct > 0 && (
        <div className="hatch-over absolute inset-y-0" style={{ left: `${spentPct}%`, width: `${committedPct}%` }} />
      )}
    </div>
  );
}
