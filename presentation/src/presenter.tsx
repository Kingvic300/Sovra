import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Canvas } from "./deck";
import { PITCH_SECONDS, SLIDES } from "./slides";
import { clock, openChannel, parseRange, type SyncMessage } from "./sync";
import { cx, Logo } from "./ui";

/** Presenter window: script, timer and next slide, kept in step with the deck window. */
export function Presenter() {
  const [index, setIndex] = useState(0);
  const [connected, setConnected] = useState(false);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const channel = useRef<ReturnType<typeof openChannel> | null>(null);
  const startedAt = useRef<number | null>(null);
  const banked = useRef(0);

  useEffect(() => {
    const ch = openChannel((m: SyncMessage) => {
      if (m.type === "index") {
        setIndex(m.index);
        setConnected(true);
      }
    });
    channel.current = ch;
    ch.post({ type: "hello" });
    document.title = "Presenter · Sovra";
    return () => ch.close();
  }, []);

  useEffect(() => {
    if (!running) return;
    startedAt.current = performance.now();
    const t = window.setInterval(() => {
      if (startedAt.current !== null) setElapsed(banked.current + (performance.now() - startedAt.current) / 1000);
    }, 250);
    return () => {
      window.clearInterval(t);
      if (startedAt.current !== null) banked.current += (performance.now() - startedAt.current) / 1000;
      startedAt.current = null;
    };
  }, [running]);

  const go = (to: number) => {
    const next = Math.min(SLIDES.length - 1, Math.max(0, to));
    setIndex(next);
    channel.current?.post({ type: "go", index: next });
    // The timer starts with the first move, so pressing → on the title slide starts the clock.
    if (!running && elapsed === 0 && next > 0) setRunning(true);
  };

  const reset = () => {
    setRunning(false);
    banked.current = 0;
    startedAt.current = null;
    setElapsed(0);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const onControl = e.target instanceof HTMLElement && e.target.closest("button");
      if (e.key === "ArrowRight" || e.key === "PageDown" || (e.key === " " && !onControl)) go(index + 1);
      else if (e.key === "ArrowLeft" || e.key === "PageUp") go(index - 1);
      else if (e.key === "t") setRunning((r) => !r);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const slide = SLIDES[index];
  const next = SLIDES[index + 1];
  const range = parseRange(slide.notes?.time);
  const over = elapsed > PITCH_SECONDS;
  let pace: { text: string; tone: "ok" | "warn" } | null = null;
  if (range && elapsed > 0) {
    if (elapsed > range[1] + 3) pace = { text: `${Math.round(elapsed - range[1])}s behind`, tone: "warn" };
    else if (elapsed < range[0] - 3) pace = { text: `${Math.round(range[0] - elapsed)}s ahead`, tone: "ok" };
    else pace = { text: "On pace", tone: "ok" };
  }

  return (
    <div className="flex h-full flex-col bg-[#0a1226] text-white">
      <header className="flex items-center gap-4 border-b border-white/10 px-6 py-3">
        <Logo className="size-7" tone="white" />
        <span className="text-[15px] font-semibold">Presenter view</span>
        <span className={cx("rounded-full px-2.5 py-0.5 text-[12px] font-semibold", connected ? "bg-[#3ddc97]/15 text-[#3ddc97]" : "bg-white/10 text-white/60")}>
          {connected ? "Synced with deck" : "Open the deck in another window"}
        </span>
        <div className="ml-auto flex items-center gap-3">
          {pace && <span className={cx("text-[14px] font-semibold", pace.tone === "warn" ? "text-[#ffc861]" : "text-[#3ddc97]")}>{pace.text}</span>}
          <span className={cx("text-[34px] font-bold tabular-nums", over && "text-[#ff8a8e]")}>{clock(elapsed)}</span>
          <span className="text-[16px] text-white/45 tabular-nums">/ {clock(PITCH_SECONDS)}</span>
          <IconButton label={running ? "Pause timer (T)" : "Start timer (T)"} onClick={() => setRunning((r) => !r)}>
            {running ? <Pause className="size-4" /> : <Play className="size-4" />}
          </IconButton>
          <IconButton label="Reset timer" onClick={reset}>
            <RotateCcw className="size-4" />
          </IconButton>
        </div>
      </header>

      <div className="h-1 bg-white/10">
        <div className={cx("h-full transition-[width]", over ? "bg-[#ff8a8e]" : "bg-signal")} style={{ width: `${Math.min(100, (elapsed / PITCH_SECONDS) * 100)}%` }} />
      </div>

      <main className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-6 p-6">
        <section className="flex min-h-0 flex-col gap-4">
          <Thumb index={index} label="Now" />
          <div className="flex items-end gap-4">
            <div className="w-1/2">{next ? <Thumb index={index + 1} label="Next" small /> : <p className="text-white/45">Last slide</p>}</div>
            <div className="ml-auto flex gap-2">
              <IconButton label="Previous slide" onClick={() => go(index - 1)} large>
                <ChevronLeft className="size-6" />
              </IconButton>
              <IconButton label="Next slide" onClick={() => go(index + 1)} large>
                <ChevronRight className="size-6" />
              </IconButton>
            </div>
          </div>
        </section>
        <section className="flex min-h-0 flex-col rounded-2xl bg-white/[0.04] p-7 ring-1 ring-white/10">
          <div className="flex items-baseline gap-3">
            <span className="text-[14px] font-semibold text-white/45 tabular-nums">
              {String(index + 1).padStart(2, "0")} / {String(SLIDES.length).padStart(2, "0")}
            </span>
            <h1 className="text-[20px] font-bold">{slide.title}</h1>
            {slide.notes?.time && <span className="ml-auto rounded-full bg-signal/15 px-3 py-1 text-[13px] font-semibold text-signal">{slide.notes.time}</span>}
          </div>
          <div className="mt-5 min-h-0 flex-1 overflow-y-auto pr-2">
            {slide.notes ? (
              slide.notes.script.split("\n\n").map((para) => (
                <p key={para} className="mb-4 text-[22px] leading-[1.5] text-white/90">
                  {para}
                </p>
              ))
            ) : (
              <p className="text-[18px] text-white/50">{slide.appendix ? "Appendix slide, for questions after the pitch. No script." : "No notes for this slide."}</p>
            )}
          </div>
          <p className="mt-4 text-[13px] text-white/40">← → change slide · T start or pause the timer · the timer starts on your first →</p>
        </section>
      </main>
    </div>
  );
}

function Thumb({ index, label, small = false }: { index: number; label: string; small?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!box.current) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);
  const s = SLIDES[index];
  return (
    <div ref={box} className="w-full">
      <p className={cx("mb-1.5 font-semibold tracking-[0.12em] text-white/45 uppercase", small ? "text-[11px]" : "text-[12px]")}>{label}</p>
      {width > 0 && (
        <div className="frozen pointer-events-none overflow-hidden rounded-xl ring-1 ring-white/15" inert>
          <Canvas scale={width / 1600}>
            <s.Component active={false} />
          </Canvas>
        </div>
      )}
    </div>
  );
}

function IconButton({ label, onClick, children, large = false }: { label: string; onClick: () => void; children: ReactNode; large?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cx("grid place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20", large ? "size-14" : "size-9")}
    >
      {children}
    </button>
  );
}
