import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { ApiError } from "@/lib/api";
import { ToastContext, type Toast, type ToastApi, type ToastInput, type ToastTone } from "@/lib/toast-context";

const MAX_VISIBLE = 4;
const DEFAULT_MS: Record<ToastTone, number> = { success: 4000, info: 5000, error: 8000 };

const TONE: Record<ToastTone, { icon: typeof Info; tile: string; bar: string; action: string }> = {
  success: { icon: CircleCheck, tile: "bg-gain-soft text-gain", bar: "bg-gain", action: "bg-gain-soft text-gain hover:bg-gain hover:text-white" },
  error: { icon: CircleAlert, tile: "bg-over-soft text-over", bar: "bg-over", action: "bg-over-soft text-over hover:bg-over hover:text-white" },
  info: { icon: Info, tile: "bg-cobalt-soft text-cobalt", bar: "bg-cobalt", action: "bg-cobalt-soft text-cobalt hover:bg-cobalt hover:text-white" },
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const { icon: Icon, tile, bar, action } = TONE[toast.tone];
  const [paused, setPaused] = useState(false);
  const [duration] = useState(() => toast.duration ?? DEFAULT_MS[toast.tone]);
  const remaining = useRef(duration);
  const startedAt = useRef(0);

  // Auto-dismiss, pausing while the pointer or focus is on the toast.
  useEffect(() => {
    if (paused) return;
    startedAt.current = Date.now();
    const timer = setTimeout(onDismiss, remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current -= Date.now() - startedAt.current;
    };
  }, [paused, onDismiss]);

  return (
    <li
      role={toast.tone === "error" ? "alert" : "status"}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="pointer-events-auto relative w-full overflow-hidden rounded-2xl bg-card shadow-pop ring-1 ring-line motion-safe:animate-[toast-in_180ms_ease-out]"
    >
      <div className="flex items-start gap-3 py-3.5 pr-2.5 pl-3.5">
        {toast.media ?? (
          <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${tile}`} aria-hidden>
            <Icon className="size-5" />
          </span>
        )}
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="leading-snug font-semibold">{toast.title}</p>
          {toast.description && <p className="mt-0.5 text-[14px] leading-snug text-muted">{toast.description}</p>}
          {toast.action && (
            <button
              type="button"
              onClick={() => {
                toast.action!.onClick();
                onDismiss();
              }}
              className={`mt-2.5 inline-flex h-8 items-center rounded-full px-3.5 text-[13px] font-semibold transition-colors pointer-coarse:h-10 ${action}`}
            >
              {toast.action.label}
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss notification"
          className="grid size-8 shrink-0 place-items-center rounded-md text-muted hover:bg-porcelain hover:text-ink pointer-coarse:size-11"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      {/* Time left before it closes; stops while hovered or focused. */}
      <span
        className={`absolute inset-x-0 bottom-0 h-[3px] origin-left opacity-60 motion-reduce:hidden ${bar}`}
        style={{ animation: `toast-timer ${duration}ms linear forwards`, animationPlayState: paused ? "paused" : "running" }}
        aria-hidden
      />
    </li>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);

  const push = useCallback((tone: ToastTone, input: ToastInput | string) => {
    const id = nextId.current++;
    const toast: Toast = { id, tone, ...(typeof input === "string" ? { title: input } : input) };
    setToasts((all) => [...all, toast].slice(-MAX_VISIBLE));
    return id;
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (i) => push("success", i),
      error: (i) => push("error", i),
      info: (i) => push("info", i),
      dismiss,
    }),
    [push, dismiss],
  );

  // Last line of defence: surface any promise rejection nobody handled.
  useEffect(() => {
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason;
      push("error", {
        title: "Something went wrong",
        description: reason instanceof ApiError ? reason.message : "Try again. If it keeps happening, reload the page.",
      });
    };
    window.addEventListener("unhandledrejection", onRejection);
    return () => window.removeEventListener("unhandledrejection", onRejection);
  }, [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ol
        aria-live="polite"
        aria-label="Notifications"
        className="pointer-events-none fixed inset-x-3 bottom-3 z-50 flex flex-col gap-2 in-[.has-tabbar]:max-lg:bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-[380px]"
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </ol>
    </ToastContext.Provider>
  );
}
