import type { CSSProperties, ReactNode } from "react";

/** Stagger delay for `.rise` / `.pop` / `.grow-x`, in milliseconds. */
export const d = (ms: number) => ({ "--d": ms }) as CSSProperties;

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function Logo({ className, tone = "ink" }: { className?: string; tone?: "ink" | "white" }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" fill={tone === "ink" ? "#0F1B33" : "#FFFFFF"} />
      <path
        d="M22 9.4H12.4a2.4 2.4 0 0 0-2.4 2.4v1.8a2.4 2.4 0 0 0 2.4 2.4h7.2a2.4 2.4 0 0 1 2.4 2.4v1.8a2.4 2.4 0 0 1-2.4 2.4H10"
        fill="none"
        stroke={tone === "ink" ? "#FFFFFF" : "#0F1B33"}
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="22" cy="22.6" r="1.9" fill="#4F7BFF" />
    </svg>
  );
}

export function Wordmark({ tone = "ink", className }: { tone?: "ink" | "white"; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-3", className)}>
      <Logo className="size-10" tone={tone === "ink" ? "ink" : "white"} />
      <span className={cx("text-[26px] font-bold tracking-tight", tone === "white" ? "text-white" : "text-ink")}>Sovra</span>
    </span>
  );
}

export function Kicker({ children, tone = "light", delay = 0 }: { children: ReactNode; tone?: "light" | "dark"; delay?: number }) {
  return (
    <p
      className={cx(
        "rise inline-flex items-center gap-2.5 text-[17px] font-semibold tracking-[0.14em] uppercase",
        tone === "dark" ? "text-signal" : "text-cobalt",
      )}
      style={d(delay)}
    >
      <span className={cx("h-[2px] w-7 rounded-full", tone === "dark" ? "bg-signal" : "bg-cobalt")} />
      {children}
    </p>
  );
}

export function Remembered({ children, draw = false }: { children: ReactNode; draw?: boolean }) {
  return <mark className={cx("remembered", draw && "remembered-draw")}>{children}</mark>;
}

/** Render `text` with `highlight` marked, the way the app's Memory page does. */
export function MemoryText({ text, highlight }: { text: string; highlight: string }) {
  const at = text.indexOf(highlight);
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <Remembered>{highlight}</Remembered>
      {text.slice(at + highlight.length)}
    </>
  );
}

export function Card({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={cx("rounded-card bg-card shadow-card ring-1 ring-line", className)} style={style}>
      {children}
    </div>
  );
}

export function Chip({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "cobalt" | "gain" | "caution" | "over" | "dark"; className?: string }) {
  const tones = {
    neutral: "bg-track text-muted",
    cobalt: "bg-cobalt-soft text-cobalt",
    gain: "bg-gain-soft text-gain",
    caution: "bg-caution-soft text-caution",
    over: "bg-over-soft text-over",
    dark: "bg-white/10 text-white/80",
  };
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[14px] font-semibold", tones[tone], className)}>
      {children}
    </span>
  );
}

export function Bar({ value, max, tone = "cobalt", pending = 0, className }: { value: number; max: number; tone?: "cobalt" | "gain" | "caution" | "over"; pending?: number; className?: string }) {
  const total = Math.max(max, value + pending);
  const fill = { cobalt: "bg-cobalt", gain: "bg-gain", caution: "bg-caution", over: "bg-over" }[tone];
  return (
    <div className={cx("relative flex h-3 w-full overflow-hidden rounded-full bg-track", className)}>
      <div className={cx("h-full", fill)} style={{ width: `${(value / total) * 100}%` }} />
      {pending > 0 && <div className="hatch-over h-full opacity-80" style={{ width: `${(pending / total) * 100}%` }} />}
      {value + pending > max && <div className="absolute inset-y-0 w-[2px] bg-ink" style={{ left: `${(max / total) * 100}%` }} />}
    </div>
  );
}

export const money = (n: number, cents = true) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });

/** Every app screenshot in /public/screens, captured from the real app (demo account, 1440×900 at 2×). */
export const SCREENS = [
  "home",
  "signin",
  "onboarding-1",
  "onboarding-2",
  "onboarding-3",
  "onboarding-4",
  "overview",
  "overview-lower",
  "transactions-learn",
  "budgets",
  "goals",
  "recurring",
  "accounts",
  "memory",
  "ask",
  "audit",
  "guard",
] as const;
export type ScreenName = (typeof SCREENS)[number];

/**
 * A real app screenshot in a browser frame.
 * `focus` zooms into part of the page: [scale, x%, y%], where x/y is the point that stays in view.
 */
export function Shot({
  name,
  url,
  className,
  style,
  focus,
  chrome = true,
  dark = false,
}: {
  name: ScreenName;
  url?: string;
  className?: string;
  style?: CSSProperties;
  focus?: [number, number, number];
  chrome?: boolean;
  dark?: boolean;
}) {
  const [scale, x, y] = focus ?? [1, 0, 0];
  return (
    <div
      className={cx("flex flex-col overflow-hidden rounded-[16px] shadow-pop ring-1", dark ? "bg-ink-2 ring-white/15" : "bg-card ring-black/10", className)}
      style={style}
    >
      {chrome && (
        <div className={cx("flex h-9 shrink-0 items-center gap-3 border-b px-4", dark ? "border-white/10 bg-ink-2" : "border-line bg-[#f6f8fb]")}>
          <span className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-[#ff5f57]" />
            <span className="size-2.5 rounded-full bg-[#febc2e]" />
            <span className="size-2.5 rounded-full bg-[#28c840]" />
          </span>
          <span className={cx("mx-auto flex h-6 min-w-[40%] items-center justify-center rounded-md px-3 text-[12px]", dark ? "bg-white/8 text-white/55" : "bg-white text-muted ring-1 ring-line")}>
            sovra.vercel.app{url ?? ""}
          </span>
          <span className="w-[46px]" />
        </div>
      )}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <img
          src={`/screens/${name}.webp`}
          alt=""
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover object-left-top"
          style={scale !== 1 ? { transform: `scale(${scale})`, transformOrigin: `${x}% ${y}%` } : undefined}
        />
      </div>
    </div>
  );
}

export type CropName = "crop-overview-alert" | "crop-tx-prompt" | "crop-accounts-wallet" | "crop-ask-answer" | "crop-onboarding-panel" | "crop-budgets-ent";

/** A close-up cut from a real screenshot, shown as a floating card. */
export function Crop({ name, className, style }: { name: CropName; className?: string; style?: CSSProperties }) {
  return (
    <div className={cx("overflow-hidden rounded-[14px] bg-card shadow-[0_30px_70px_-20px_rgb(15_27_51/0.55)] ring-1 ring-black/10", className)} style={style}>
      <img src={`/screens/${name}.webp`} alt="" draggable={false} className="block h-auto w-full" />
    </div>
  );
}
