export function Sparkline({ data, className = "" }: { data: number[]; className?: string }) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const points = data.map((v, i) => [(i / (data.length - 1)) * 300, 66 - ((v - min) / span) * 58]);
  const line = points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");
  return (
    <svg viewBox="0 0 300 72" preserveAspectRatio="none" className={className} aria-hidden="true">
      <path d={`${line} L300 72 L0 72Z`} fill="currentColor" opacity={0.09} />
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
