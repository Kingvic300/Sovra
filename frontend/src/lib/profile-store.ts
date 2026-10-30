import type { Profile } from "@/lib/auth-context";

const DEMO_FLAG = "sovra.demo";
const EMAIL_SESSION = "sovra.emailSession";
const profileKey = (address: string) => `sovra.profile.${address}`;

export function readDemoFlag() {
  return localStorage.getItem(DEMO_FLAG) === "1";
}

export function writeDemoFlag(on: boolean) {
  if (on) localStorage.setItem(DEMO_FLAG, "1");
  else localStorage.removeItem(DEMO_FLAG);
}

export function readProfile(address: string): Profile | null {
  try {
    const raw = localStorage.getItem(profileKey(address));
    return raw ? (JSON.parse(raw) as Profile) : null;
  } catch {
    return null;
  }
}

export function writeProfile(address: string, profile: Profile) {
  localStorage.setItem(profileKey(address), JSON.stringify(profile));
}

/** `method` is the account type: an email account, or a wallet account that added email sign-in. */
export type EmailSession = { address: string; email: string; name: string; method: "email" | "wallet" };

/** Who signed in with email in this browser. The backend cookie is what actually authorizes requests. */
export function readEmailSession(): EmailSession | null {
  try {
    const raw = localStorage.getItem(EMAIL_SESSION);
    // Sessions saved before wallet accounts could sign in with email were all email accounts.
    return raw ? { method: "email", ...(JSON.parse(raw) as Partial<EmailSession>) } as EmailSession : null;
  } catch {
    return null;
  }
}

export function writeEmailSession(session: EmailSession | null) {
  if (session) localStorage.setItem(EMAIL_SESSION, JSON.stringify(session));
  else localStorage.removeItem(EMAIL_SESSION);
}

/** Forgets what this browser keeps for an address (profile, answered insights), after its account is deleted. */
export function clearLocalData(address: string) {
  localStorage.removeItem(profileKey(address));
  // Kept by AppDataProvider.
  localStorage.removeItem(`sovra.local.${address}`);
}
