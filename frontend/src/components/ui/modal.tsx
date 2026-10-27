import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/** Accessible dialog built on <dialog>: focus trap, Escape and backdrop click close it. */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  width = 520,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  width?: number;
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
      style={{ width: `min(${width}px, calc(100vw - 2rem))` }}
      className="m-auto rounded-[20px] bg-card p-0 text-ink shadow-pop backdrop:bg-ink/40 backdrop:backdrop-blur-[2px]"
    >
      <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
        <div>
          <h2 className="text-[18px] font-bold">{title}</h2>
          {description && <p className="mt-0.5 text-[14px] text-muted">{description}</p>}
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-md text-muted hover:bg-porcelain hover:text-ink pointer-coarse:size-11">
          <X className="size-4" />
        </button>
      </div>
      {open && children}
    </dialog>
  );
}
