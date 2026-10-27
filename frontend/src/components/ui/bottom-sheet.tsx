import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * Mobile sheet that slides up from the bottom. Built on <dialog> so focus is
 * trapped and Escape or a tap on the backdrop closes it.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-label={title}
      className="m-0 mt-auto max-h-[85dvh] w-full max-w-none rounded-t-[24px] bg-card p-0 pb-[env(safe-area-inset-bottom)] text-ink shadow-pop backdrop:bg-ink/40 motion-safe:animate-[sheet-in_220ms_ease-out]"
    >
      <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-line" aria-hidden />
      <div className="flex items-center justify-between px-5 pt-3 pb-2">
        <h2 className="text-[18px] font-bold">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="grid size-11 place-items-center rounded-full text-muted hover:bg-porcelain hover:text-ink"
        >
          <X className="size-5" aria-hidden />
        </button>
      </div>
      {open && <div className="px-3 pb-4">{children}</div>}
    </dialog>
  );
}
