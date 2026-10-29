import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useDAppKit, useWalletConnection, type UiWallet } from "@mysten/dapp-kit-react";
import { api } from "@/lib/api";
import { AuthContext, type AuthState, type Profile, type Session } from "@/lib/auth-context";
import { ACCOUNTS, USER_NAME } from "@/lib/demo-data";
import { readDemoFlag, readProfile, writeDemoFlag, writeProfile } from "@/lib/profile-store";
import { endServerSession, ensureServerSession, type ServerSession } from "@/lib/server-session";

const DEMO_ADDRESS = ACCOUNTS.find((a) => a.source === "tatum")!.address!;

const DEMO_SESSION: Session = {
  method: "demo",
  address: DEMO_ADDRESS,
  name: `${USER_NAME} Okafor`,
  email: "ada@example.com",
};

const DEMO_PROFILE: Profile = {
  name: USER_NAME,
  onboarded: true,
  goal: { name: "Laptop fund", target: 1200, due: "2027-01-31" },
  limit: { category: "entertainment", amount: 100 },
  payday: 25,
  sources: { csv: true, sui: true },
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const dAppKit = useDAppKit();
  const connection = useWalletConnection();
  const [demo, setDemo] = useState(readDemoFlag);
  // Bumped after saving so the profile is re-read from storage.
  const [profileRevision, setProfileRevision] = useState(0);
  const [server, setServer] = useState<{ address: string; status: ServerSession } | null>(null);

  const walletAddress = connection.isConnected && connection.account ? connection.account.address : null;

  const session: Session | null = useMemo(() => {
    if (walletAddress) return { method: "wallet", address: walletAddress, name: "" };
    return demo ? DEMO_SESSION : null;
  }, [walletAddress, demo]);

  // Prove the session to the backend so its data routes trust this address.
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    ensureServerSession(session, async (message) => (await dAppKit.signPersonalMessage({ message })).signature).then(
      async (status) => {
        // The saved profile lives on the backend; keep the browser copy in step with it.
        if (status === "verified") {
          const me = await api<{ profile: Profile | null }>("/me").catch(() => null);
          if (!cancelled && me?.profile) {
            writeProfile(session.address, me.profile);
            setProfileRevision((n) => n + 1);
          }
        }
        if (!cancelled) setServer({ address: session.address, status });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [session, dAppKit]);

  const serverStatus: ServerSession = !session ? "idle" : server?.address === session.address ? server.status : "checking";

  const profile = useMemo(() => {
    void profileRevision;
    if (!session) return null;
    return readProfile(session.address) ?? (session.method === "demo" ? DEMO_PROFILE : null);
  }, [session, profileRevision]);

  const signInWithWallet = useCallback(
    async (wallet: UiWallet) => {
      writeDemoFlag(false);
      setDemo(false);
      await dAppKit.connectWallet({ wallet });
    },
    [dAppKit],
  );

  const startDemo = useCallback(() => {
    writeDemoFlag(true);
    setDemo(true);
  }, []);

  const signOut = useCallback(async () => {
    endServerSession();
    if (connection.isConnected) await dAppKit.disconnectWallet();
    writeDemoFlag(false);
    setDemo(false);
  }, [dAppKit, connection.isConnected]);

  const saveProfile = useCallback(
    async (next: Profile) => {
      if (!session) return;
      writeProfile(session.address, next);
      setProfileRevision((n) => n + 1);
      // The backend also turns a new goal, limit or payday into goal and budget rows and memories.
      if (serverStatus === "verified") await api("/me/profile", { method: "PUT", json: next });
    },
    [session, serverStatus],
  );

  const status: AuthState["status"] =
    !session && (connection.isReconnecting || connection.isConnecting) ? "loading" : session ? "signed-in" : "signed-out";

  const value = useMemo<AuthState>(
    () => ({ status, session, profile, server: serverStatus, signInWithWallet, startDemo, signOut, saveProfile }),
    [status, session, profile, serverStatus, signInWithWallet, startDemo, signOut, saveProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
