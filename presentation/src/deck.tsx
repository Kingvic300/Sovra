import { ChevronLeft, ChevronRight, Expand, LayoutGrid, Minimize, Presentation, RotateCw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { SLIDES } from "./slides";
import { openChannel } from "./sync";
import { cx, Logo, SCREENS } from "./ui";

const W = 1600;
const H = 900;

function readHash() {
  const n = Number.parseInt(window.location.hash.replace(/^#\/?/, ""), 10);
  return Number.isFinite(n) ? Math.min(SLIDES.length - 1, Math.max(0, n - 1)) : 0;
}

function useViewport() {
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const on = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return size;
}

/** A 1600×900 canvas scaled to fit `scale`. */
export function Canvas({ scale, children, className }: { scale: number; children: ReactNode; className?: string }) {
  return (
    <div style={{ width: W * scale, height: H * scale }} className={cx("relative overflow-hidden", className)}>
      <div style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: "top left" }} className="absolute top-0 left-0">
        {children}
      </div>
    </div>
  );
}

export function Deck() {
  const [index, setIndex] = useState(readHash);
  const [dir, setDir] = useState<"next" | "prev">("next");
  const [overview, setOverview] = useState(false);
  const [pick, setPick] = useState(0);
  const [idle, setIdle] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [rotateDismissed, setRotateDismissed] = useState(false);
  const { w, h } = useViewport();
  const idleTimer = useRef<number | undefined>(undefined);
  const touch = useRef<{ x: number; y: number } | null>(null);

  const go = useCallback((to: number) => {
    setIndex((cur) => {
      const next = Math.min(SLIDES.length - 1, Math.max(0, to));
      if (next !== cur) setDir(next > cur ? "next" : "prev");
      return next;
    });
  }, []);

  // Warm the cache with every screenshot so slides never pop in half-loaded.
  useEffect(() => {
    for (const name of SCREENS) {
      const img = new Image();
      img.src = `/screens/${name}.webp`;
    }
  }, []);

  // Keep the URL in step so a refresh or a shared link opens the same slide.
  useEffect(() => {
    const target = `#${index + 1}`;
    if (window.location.hash !== target) history.replaceState(null, "", target);
    document.title = `${SLIDES[index].title} · Sovra Presentation`;
  }, [index]);

  // Presenter window sync: tell it where we are, and follow its ← →.
  const channel = useRef<ReturnType<typeof openChannel> | null>(null);
  const indexRef = useRef(index);
  indexRef.current = index;
  useEffect(() => {
    const ch = openChannel((m) => {
      if (m.type === "go") go(m.index);
      else if (m.type === "hello") ch.post({ type: "index", index: indexRef.current });
    });
    channel.current = ch;
    return () => ch.close();
  }, [go]);
  useEffect(() => {
    channel.current?.post({ type: "index", index });
  }, [index]);

  const openPresenter = useCallback(() => {
    window.open(`${window.location.pathname}?presenter`, "sovra-presenter", "width=1280,height=800");
  }, []);

  useEffect(() => {
    const onHash = () => go(readHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [go]);

  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  }, []);

  const openOverview = useCallback(() => {
    setPick(index);
    setOverview(true);
  }, [index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (overview) {
        const cols = 4;
        if (e.key === "Escape" || e.key === "g") setOverview(false);
        else if (e.key === "ArrowRight") setPick((p) => Math.min(SLIDES.length - 1, p + 1));
        else if (e.key === "ArrowLeft") setPick((p) => Math.max(0, p - 1));
        else if (e.key === "ArrowDown") setPick((p) => Math.min(SLIDES.length - 1, p + cols));
        else if (e.key === "ArrowUp") setPick((p) => Math.max(0, p - cols));
        else if (e.key === "Enter") {
          go(pick);
          setOverview(false);
        } else return;
        e.preventDefault();
        return;
      }
      // Let buttons and links handle their own Enter/Space.
      const onControl = e.target instanceof HTMLElement && e.target.closest("button, a");
      if (e.key === "ArrowRight" || e.key === "PageDown" || (e.key === " " && !onControl)) go(index + 1);
      else if (e.key === "ArrowLeft" || e.key === "PageUp") go(index - 1);
      else if (e.key === "Home") go(0);
      else if (e.key === "End") go(SLIDES.length - 1);
      else if (e.key === "g" || e.key === "Escape") openOverview();
      else if (e.key === "f") toggleFullscreen();
      else if (e.key === "p") openPresenter();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [overview, pick, index, go, openOverview, toggleFullscreen, openPresenter]);

  // Hide the controls when the mouse rests, so the stage stays clean while presenting.
  useEffect(() => {
    const wake = () => {
      setIdle(false);
      window.clearTimeout(idleTimer.current);
      idleTimer.current = window.setTimeout(() => setIdle(true), 2600);
    };
    wake();
    window.addEventListener("mousemove", wake);
    window.addEventListener("keydown", wake);
    return () => {
      window.removeEventListener("mousemove", wake);
      window.removeEventListener("keydown", wake);
      window.clearTimeout(idleTimer.current);
    };
  }, []);

  const scale = Math.min(w / W, h / H);
  const slide = SLIDES[index];
  const Current = slide.Component;
  const portrait = h > w && w < 820;

  return (
    <div
      className="relative flex h-full w-full items-center justify-center bg-ink select-none"
      onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
      onTouchEnd={(e) => {
        const start = touch.current;
        touch.current = null;
        if (!start) return;
        const dx = e.changedTouches[0].clientX - start.x;
        const dy = e.changedTouches[0].clientY - start.y;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(index + (dx < 0 ? 1 : -1));
      }}
    >
      <div className="absolute inset-x-0 top-0 z-30 h-[3px] bg-white/10">
        <div className="h-full bg-signal transition-[width] duration-500" style={{ width: `${((index + 1) / SLIDES.length) * 100}%` }} />
      </div>

      <main aria-live="polite" aria-label={`Slide ${index + 1} of ${SLIDES.length}: ${slide.title}`}>
        <Canvas scale={scale} className="shadow-[0_30px_80px_-20px_rgb(0_0_0/0.6)]">
          <div key={index} className="h-full w-full" style={{ animation: `slide-in-${dir} 0.55s cubic-bezier(0.2, 0.7, 0.2, 1) both` }}>
            <Current active={!overview} />
          </div>
        </Canvas>
      </main>

      <nav
        aria-label="Slide controls"
        className={cx(
          "absolute bottom-5 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-full bg-ink/90 p-1.5 text-white shadow-2xl ring-1 ring-white/15 backdrop-blur transition-opacity duration-300",
          idle && !overview ? "opacity-0 hover:opacity-100 focus-within:opacity-100" : "opacity-100",
        )}
      >
        <span className="flex items-center gap-2 pr-3 pl-2">
          <Logo className="size-6" tone="white" />
          <span className="hidden text-[13px] font-semibold text-white/85 sm:inline">{slide.title}</span>
        </span>
        <CtrlButton label="Previous slide" onClick={() => go(index - 1)} disabled={index === 0}>
          <ChevronLeft className="size-[18px]" />
        </CtrlButton>
        <span className="min-w-[64px] text-center text-[13px] font-semibold tabular-nums">
          {String(index + 1).padStart(2, "0")} <span className="text-white/45">/ {String(SLIDES.length).padStart(2, "0")}</span>
        </span>
        <CtrlButton label="Next slide" onClick={() => go(index + 1)} disabled={index === SLIDES.length - 1}>
          <ChevronRight className="size-[18px]" />
        </CtrlButton>
        <span className="mx-1 h-5 w-px bg-white/15" />
        <CtrlButton label="All slides (G)" onClick={openOverview}>
          <LayoutGrid className="size-[17px]" />
        </CtrlButton>
        <CtrlButton label="Presenter view with notes (P)" onClick={openPresenter}>
          <Presentation className="size-[17px]" />
        </CtrlButton>
        <CtrlButton label={fullscreen ? "Exit full screen (F)" : "Full screen (F)"} onClick={toggleFullscreen}>
          {fullscreen ? <Minimize className="size-[17px]" /> : <Expand className="size-[17px]" />}
        </CtrlButton>
      </nav>

      {overview && (
        <Overview
          pick={pick}
          current={index}
          width={w}
          onPick={setPick}
          onOpen={(i) => {
            go(i);
            setOverview(false);
          }}
          onClose={() => setOverview(false)}
        />
      )}

      {portrait && !rotateDismissed && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-ink/95 px-10 text-center text-white backdrop-blur">
          <RotateCw className="size-10 text-signal" style={{ animation: "spin 2.4s ease-in-out infinite" }} />
          <p className="text-[20px] font-semibold">Rotate your device for presentation mode.</p>
          <button type="button" onClick={() => setRotateDismissed(true)} className="rounded-full bg-white/10 px-5 py-2 text-[15px] font-semibold ring-1 ring-white/20">
            Continue anyway
          </button>
        </div>
      )}
    </div>
  );
}

function CtrlButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="grid size-9 place-items-center rounded-full text-white/85 transition-colors hover:bg-white/12 hover:text-white disabled:pointer-events-none disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function Overview({
  pick,
  current,
  width,
  onPick,
  onOpen,
  onClose,
}: {
  pick: number;
  current: number;
  width: number;
  onPick: (i: number) => void;
  onOpen: (i: number) => void;
  onClose: () => void;
}) {
  const cols = width < 700 ? 2 : width < 1100 ? 3 : 4;
  const gap = 24;
  const pad = width < 700 ? 20 : 56;
  const thumbW = Math.min(380, (Math.min(width, 1700) - pad * 2 - gap * (cols - 1)) / cols);
  const scale = thumbW / W;
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    refs.current[pick]?.focus({ preventScroll: false });
  }, [pick]);

  return (
    <div role="dialog" aria-modal="true" aria-label="All slides" className="absolute inset-0 z-40 overflow-y-auto bg-ink/96 backdrop-blur" style={{ animation: "fade-in 0.2s ease both" }}>
      <div className="mx-auto py-10" style={{ width: thumbW * cols + gap * (cols - 1) }}>
        <div className="mb-8 flex items-center justify-between text-white">
          <div>
            <p className="text-[24px] font-bold">All slides</p>
            <p className="mt-1 text-[14px] text-white/50">← → to move · Enter to open · Esc to close</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="grid size-10 place-items-center rounded-full bg-white/10 hover:bg-white/20">
            <X className="size-5" />
          </button>
        </div>
        <div className="grid" style={{ gridTemplateColumns: `repeat(${cols}, ${thumbW}px)`, gap }}>
          {SLIDES.map((s, i) => (
            <button
              key={s.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              onClick={() => onOpen(i)}
              onMouseEnter={() => onPick(i)}
              className="group text-left outline-none"
            >
              <div
                className={cx(
                  "frozen pointer-events-none overflow-hidden rounded-xl ring-2 transition-all",
                  i === pick ? "ring-signal" : "ring-white/10 group-hover:ring-white/30",
                )}
                inert
              >
                <Canvas scale={scale}>
                  <s.Component active={false} />
                </Canvas>
              </div>
              <p className="mt-2.5 flex items-center gap-2 text-[14px] text-white/80">
                <span className="font-semibold text-white/45 tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                {s.title}
                {i === current && <span className="rounded-full bg-signal/20 px-2 py-0.5 text-[11.5px] font-semibold text-signal">Current</span>}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
