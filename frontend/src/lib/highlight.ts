/**
 * The backend stores memory sentences without their key phrase, so the phrase is found again
 * from the wording Sovra uses when it writes them (see lib/onboarding.ts and the backend's
 * shared/memory-text.ts). Returns "" when nothing matches, which renders without a mark.
 */
const PATTERNS: RegExp[] = [
  /saving for (.+?)\.?$/,
  /(under \$[\d,.]+ a month)/,
  /(paid on the \d+(?:st|nd|rd|th))/,
  /income is (irregular)/,
  /\b((?:paused|resumed|kept) .+?)(?: on | in | last |, |\.|$)/,
  /\bare (.+?)(?:,|\.|$)/,
  /^You go by (.+?)\.$/,
  /money is in (.+?)\.$/,
];

export function highlightFor(text: string) {
  for (const pattern of PATTERNS) {
    const match = pattern.exec(text);
    if (match?.[1]) return match[1];
  }
  return "";
}
