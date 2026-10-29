import { createContext, useContext } from "react";
import type { CategoryId } from "@/lib/demo-data";
import type { ServerSession } from "@/lib/server-session";

export type SignInMethod = "google" | "demo";

export type Session = {
  method: SignInMethod;
  /** zkLogin Sui address for Google users; the demo wallet for the demo account. */
  address: string;
  name: string;
  email?: string;
};

export type Profile = {
  name: string;
  onboarded: boolean;
  goal?: { name: string; target: number; due: string };
  limit?: { category: CategoryId; amount: number };
  /** Day of the month, or "irregular". */
  payday?: number | "irregular";
  sources: { csv: boolean; sui: boolean };
};

export type AuthState = {
  status: "loading" | "signed-out" | "signed-in";
  session: Session | null;
  profile: Profile | null;
  zkLoginConfigured: boolean;
  /** Whether the backend has verified this session (see server-session.ts). */
  server: ServerSession;
  signInWithGoogle: () => Promise<void>;
  startDemo: () => void;
  signOut: () => Promise<void>;
  saveProfile: (profile: Profile) => void;
};

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside <AuthProvider>");
  return value;
}

/** First name for greetings: the profile name, else the session name. Empty when unknown. */
export function firstName(auth: Pick<AuthState, "session" | "profile">) {
  const name = auth.profile?.name || auth.session?.name || "";
  return name.split(" ")[0];
}
