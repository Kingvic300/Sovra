import type { ReactNode } from "react";
import { fieldClass } from "./field-class";

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[14px] font-semibold">{label}</span>
      {children}
      {error ? (
        <span role="alert" className="mt-2 block text-[13px] text-over">
          {error}
        </span>
      ) : (
        hint && <span className="mt-2 block text-[13px] text-muted">{hint}</span>
      )}
    </label>
  );
}

/** Dollar amount input. Strips anything that isn't a digit or a dot. */
export function MoneyInput({
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  value: number;
  onChange: (n: number) => void;
  placeholder: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-[16px] text-muted">$</span>
      <input
        className={`${fieldClass} pl-8 tabular-nums`}
        inputMode="decimal"
        value={value ? String(value) : ""}
        onChange={(e) => onChange(Number(e.target.value.replace(/[^0-9.]/g, "")) || 0)}
        placeholder={placeholder}
        autoFocus={autoFocus}
      />
    </div>
  );
}

export function Chip({
  active,
  onClick,
  disabled,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled}
      className={`h-9 rounded-full border px-4 text-[14px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
        active ? "border-cobalt bg-cobalt text-white" : "border-line bg-card text-ink hover:border-cobalt/50"
      }`}
    >
      {children}
    </button>
  );
}
