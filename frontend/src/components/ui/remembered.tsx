/** Renders a memory sentence with its key phrase marked in highlighter. */
export function Remembered({ text, highlight }: { text: string; highlight: string }) {
  const at = highlight ? text.indexOf(highlight) : -1;
  if (at === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark className="remembered text-ink">{highlight}</mark>
      {text.slice(at + highlight.length)}
    </>
  );
}
