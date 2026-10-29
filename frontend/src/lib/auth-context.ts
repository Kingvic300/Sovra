import { createContext, useContext } from "react";
import type { UiWallet } from "@mysten/dapp-kit-react";
import type { CategoryId } from "@/lib/demo-data";
import type { ServerSession } from "@/lib/server-session";

export type SignInMethod = "wallet" | "email" | "demo";

export type Session = {
  method: SignInMethod;
  /**
   * The connected Sui wallet address, or the demo wallet for the demo account.
   * Email accounts get a random address from the backend that is only an id, never a wallet.
   */
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
  /** Whether the backend has verified this session (see server-session.ts). */
  server: ServerSession;
  /** Connects a Sui wallet. The backend session follows once the wallet signs Sovra's challenge. */
  signInWithWallet: (wallet: UiWallet) => Promise<void>;
  /** Create an email account or sign in to one. Rejects with ApiError, e.g. code "email_taken". */
  signUpWithEmail: (input: { name: string; email: string; password: string }) => Promise<void>;
  signInWithEmail: (input: { email: string; password: string }) => Promise<void>;
  startDemo: () => void;
  signOut: () => Promise<void>;
  /** Saves in the browser, and on the backend when it has a session. Rejects if the backend refuses. */
  saveProfile: (profile: Profile) => Promise<void>;
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
