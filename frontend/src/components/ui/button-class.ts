export type Variant = "primary" | "secondary" | "quiet";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-cobalt text-white hover:bg-cobalt-deep",
  secondary: "border border-field/60 bg-card text-ink hover:border-field",
  quiet: "text-cobalt hover:bg-cobalt-soft",
};

export function buttonClass(variant: Variant = "primary", size: "md" | "sm" = "md") {
  // Compact on desktop; at least 44px tall on touch screens.
  const sizing = size === "sm" ? "h-8 px-3 text-[13px] pointer-coarse:h-11" : "h-10 px-4 text-sm pointer-coarse:h-11";
  return `inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${sizing} ${VARIANTS[variant]}`;
}
