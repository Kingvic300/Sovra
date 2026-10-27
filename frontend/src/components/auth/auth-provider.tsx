import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useDAppKit, useWalletConnection, useWallets } from "@mysten/dapp-kit-react";
import { getSession, isEnokiWallet, isGoogleWallet } from "@mysten/enoki";
import { AuthContext, type AuthState, type Profile, type Session } from "@/lib/auth-context";
import { zkLoginConfigured } from "@/lib/dapp-kit";
import { ACCOUNTS, USER_NAME } from "@/lib/demo-data";
import {
  claimsFromJwt,
  readDemoFlag,
  readMockGoogleFlag,
  readProfile,
  writeDemoFlag,
  writeMockGoogleFlag,
  writeProfile,
} from "@/lib/profile-store";

const DEMO_ADDRESS = ACCOUNTS.find((a) => a.source === "tatum")!.address!;

const DEMO_SESSION: Session = {
  method: "demo",
  address: DEMO_ADDRESS,
  name: `${USER_NAME} Okafor`,
  email: "ada@example.com",
};

/**
 * Stand-in for a Google zkLogin account while VITE_ENOKI_API_KEY and
 * VITE_GOOGLE_CLIENT_ID aren't set. Remove once real zkLogin is configured.
 */
const MOCK_GOOGLE_SESSION: Session = {
  method: "google",
  address: "0x5c2fa94e81d7b36c0e4a29f1d8b75c6e3a0f94d2b18e7c56a3d09f4e2b71c8a6",
  name: "Ada Okafor",
  email: "ada.okafor@gmail.com",
};

const DEMO_PROFILE: Profile = {
  name: USER_NAME,
  onboarded: true,
  goal: { name: "Laptop fund", target: 1200, due: "2027-01-31" },
  limit: { category: "entertainment", amount: 100 },
  payday: 25,
  sources: { csv: true, sui: true },
};

type Claims = { address: string; name?: string; email?: string };

export function AuthProvider({ children }: { children: ReactNode }) {
  const dAppKit = useDAppKit();
  const connection = useWalletConnection();
  const wallets = useWallets();
  const [demo, setDemo] = useState(readDemoFlag);
  const [mockGoogle, setMockGoogle] = useState(readMockGoogleFlag);
  const [claims, setClaims] = useState<Claims | null>(null);
  // Bumped after saving so the profile is re-read from storage.
  const [profileRevision, setProfileRevision] = useState(0);

  const zkWallet = connection.isConnected && isEnokiWallet(connection.wallet) ? connection.wallet : null;
  const zkAddress = zkWallet && connection.account ? connection.account.address : null;

  // Pull the Google name and email out of the zkLogin session for greetings.
  useEffect(() => {
    if (!zkWallet || !zkAddress) return;
    let cancelled = false;
    getSession(zkWallet)
      .then((s) => {
        if (!cancelled) setClaims({ address: zkAddress, ...(s?.jwt ? claimsFromJwt(s.jwt) : {}) });
      })
      .catch(() => {
        if (!cancelled) setClaims({ address: zkAddress });
      });
    return () => {
      cancelled = true;
    };
  }, [zkWallet, zkAddress]);

  const session: Session | null = useMemo(() => {
    if (zkAddress) {
      const c = claims?.address === zkAddress ? claims : null;
      return { method: "google", address: zkAddress, name: c?.name ?? "", email: c?.email };
    }
    if (mockGoogle) return MOCK_GOOGLE_SESSION;
    return demo ? DEMO_SESSION : null;
  }, [zkAddress, claims, demo, mockGoogle]);

  const profile = useMemo(() => {
    void profileRevision;
    if (!session) return null;
    if (session.address === MOCK_GOOGLE_SESSION.address) return readProfile(session.address) ?? DEMO_PROFILE;
    return readProfile(session.address) ?? (session.method === "demo" ? DEMO_PROFILE : null);
  }, [session, profileRevision]);

  const signInWithGoogle = useCallback(async () => {
    const google = wallets.find((w) => isGoogleWallet(w));
    writeDemoFlag(false);
    setDemo(false);
    if (!zkLoginConfigured || !google) {
      // Mock: behave like a successful Google sign-in.
      await new Promise((r) => setTimeout(r, 700));
      writeMockGoogleFlag(true);
      setMockGoogle(true);
      return;
    }
    await dAppKit.connectWallet({ wallet: google });
  }, [dAppKit, wallets]);

  const startDemo = useCallback(() => {
    writeDemoFlag(true);
    setDemo(true);
  }, []);

  const signOut = useCallback(async () => {
    if (zkWallet) await dAppKit.disconnectWallet();
    writeDemoFlag(false);
    setDemo(false);
    writeMockGoogleFlag(false);
    setMockGoogle(false);
  }, [dAppKit, zkWallet]);

  const saveProfile = useCallback(
    (next: Profile) => {
      if (!session) return;
      writeProfile(session.address, next);
      setProfileRevision((n) => n + 1);
    },
    [session],
  );

  const status: AuthState["status"] =
    !session && (connection.isReconnecting || connection.isConnecting) ? "loading" : session ? "signed-in" : "signed-out";

  const value = useMemo<AuthState>(
    () => ({ status, session, profile, zkLoginConfigured, signInWithGoogle, startDemo, signOut, saveProfile }),
    [status, session, profile, signInWithGoogle, startDemo, signOut, saveProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
