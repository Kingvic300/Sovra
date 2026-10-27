/** Squared S drawn as one continuous line, like ledger rows joined up. 32×32 grid. */
const MARK_PATH = "M24 7.2H11a3 3 0 0 0-3 3v2.8a3 3 0 0 0 3 3h10a3 3 0 0 1 3 3v2.8a3 3 0 0 1-3 3H8";
/** Same S, inset for use inside the app-icon tile. */
const TILE_PATH = "M22 9.4H12.4a2.4 2.4 0 0 0-2.4 2.4v1.8a2.4 2.4 0 0 0 2.4 2.4h7.2a2.4 2.4 0 0 1 2.4 2.4v1.8a2.4 2.4 0 0 1-2.4 2.4H10";

/**
 * Sovra "ledger S" mark.
 * - "mark": cobalt S for light backgrounds.
 * - "white": white S for dark backgrounds.
 * - "tile": navy tile, white S and a cobalt signal dot; app icon and favicon.
 */
export function Logo({
  className = "",
  variant = "mark",
}: {
  className?: string;
  variant?: "mark" | "tile" | "white";
}) {
  if (variant === "tile") {
    return (
      <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="#0F1B33" />
        <path d={TILE_PATH} fill="none" stroke="#fff" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="22" cy="22.6" r="1.9" fill="#4F7BFF" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path
        d={MARK_PATH}
        fill="none"
        stroke={variant === "white" ? "#fff" : "#2340D0"}
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Mark plus the "Sovra" wordmark. */
export function Wordmark({ className = "", tone = "ink" }: { className?: string; tone?: "ink" | "white" }) {
  return (
    <span className={`inline-flex items-center gap-1.5 font-extrabold tracking-[-0.035em] ${className}`}>
      <Logo variant={tone === "white" ? "white" : "mark"} className="size-[1.3em]" />
      <span className={tone === "white" ? "text-white" : "text-ink"}>Sovra</span>
    </span>
  );
}
