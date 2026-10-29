/** Currencies offered first in pickers; every other ISO code the browser knows follows. */
const COMMON = ["NGN", "USD", "GHS", "KES", "ZAR", "EGP", "GBP", "EUR", "CAD", "INR", "XOF", "XAF"];

/** Country (from the browser's language tag) to its currency, for the default in setup. */
const BY_REGION: Record<string, string> = {
  NG: "NGN", GH: "GHS", KE: "KES", ZA: "ZAR", EG: "EGP", GB: "GBP", US: "USD", CA: "CAD", IN: "INR", AU: "AUD",
  SN: "XOF", CI: "XOF", CM: "XAF", UG: "UGX", TZ: "TZS", RW: "RWF", DE: "EUR", FR: "EUR", ES: "EUR", IT: "EUR",
  NL: "EUR", IE: "EUR", PT: "EUR", BE: "EUR",
};

const names = (() => {
  try {
    return new Intl.DisplayNames(["en"], { type: "currency" });
  } catch {
    return null;
  }
})();

/** "Nigerian Naira" */
export function currencyName(code: string) {
  return names?.of(code) ?? code;
}

/** Common currencies first, then the rest alphabetically. */
export function currencyOptions() {
  let all: string[] = [];
  try {
    all = Intl.supportedValuesOf("currency");
  } catch {
    all = [];
  }
  const rest = all.filter((c) => !COMMON.includes(c));
  return [...COMMON, ...rest].map((code) => ({ code, label: `${currencyName(code)} (${code})` }));
}

/** A sensible default: the currency of the country in the browser's language, else USD. */
export function guessCurrency() {
  for (const tag of typeof navigator === "undefined" ? [] : navigator.languages ?? [navigator.language]) {
    const region = tag.split("-")[1]?.toUpperCase();
    if (region && BY_REGION[region]) return BY_REGION[region];
  }
  return "USD";
}
