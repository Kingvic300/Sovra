export type Variant = "primary" | "secondary" | "quiet";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-cobalt text-white hover:bg-cobalt-deep",
  secondary: "border border-line bg-card text-ink hover:border-muted/50",
  quiet: "text-cobalt hover:bg-cobalt-soft",
};

export function buttonClass(variant: Variant = "primary", size: "md" | "sm" = "md") {
  const sizing = size === "sm" ? "h-8 px-3 text-[13px]" : "h-10 px-4 text-sm";
  return `inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${sizing} ${VARIANTS[variant]}`;
}
