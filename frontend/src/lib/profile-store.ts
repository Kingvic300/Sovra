import type { Profile } from "@/lib/auth-context";

const DEMO_FLAG = "sovra.demo";
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
