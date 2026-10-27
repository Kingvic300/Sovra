import type { Profile } from "@/lib/auth-context";

const DEMO_FLAG = "sovra.demo";
const MOCK_GOOGLE_FLAG = "sovra.mockGoogle";
const profileKey = (address: string) => `sovra.profile.${address}`;

export function readDemoFlag() {
  return localStorage.getItem(DEMO_FLAG) === "1";
}

export function writeDemoFlag(on: boolean) {
  if (on) localStorage.setItem(DEMO_FLAG, "1");
  else localStorage.removeItem(DEMO_FLAG);
}

/** Mock Google sign-in, used while zkLogin keys aren't configured. */
export function readMockGoogleFlag() {
  return localStorage.getItem(MOCK_GOOGLE_FLAG) === "1";
}

export function writeMockGoogleFlag(on: boolean) {
  if (on) localStorage.setItem(MOCK_GOOGLE_FLAG, "1");
  else localStorage.removeItem(MOCK_GOOGLE_FLAG);
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

/** Reads name and email from a Google ID token. The token is not verified here; it's display-only. */
export function claimsFromJwt(jwt: string): { name?: string; email?: string } {
  try {
    const payload = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(decodeURIComponent(escape(atob(payload)))) as Record<string, unknown>;
    return {
      name: typeof json.name === "string" ? json.name : undefined,
      email: typeof json.email === "string" ? json.email : undefined,
    };
  } catch {
    return {};
  }
}
