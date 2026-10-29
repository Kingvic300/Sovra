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

export type EmailSession = { address: string; email: string; name: string };

/** Who signed in with email in this browser. The backend cookie is what actually authorizes requests. */
export function readEmailSession(): EmailSession | null {
  try {
    const raw = localStorage.getItem(EMAIL_SESSION);
    return raw ? (JSON.parse(raw) as EmailSession) : null;
  } catch {
    return null;
  }
}

export function writeEmailSession(session: EmailSession | null) {
  if (session) localStorage.setItem(EMAIL_SESSION, JSON.stringify(session));
  else localStorage.removeItem(EMAIL_SESSION);
}
