/** First focusable element on the page: lets keyboard users jump past navigation. */
export function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only rounded-lg bg-ink px-4 py-3 font-semibold text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60]"
    >
      Skip to main content
    </a>
  );
}
