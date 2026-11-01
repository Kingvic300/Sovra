import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useDAppKit, useWalletConnection, type UiWallet } from "@mysten/dapp-kit-react";
import { WalletFailedBadge } from "@/components/ui/wallet-badge";
import { api, UNAUTHORIZED_EVENT } from "@/lib/api";
import { AuthContext, type AuthState, type Profile, type Session } from "@/lib/auth-context";
import { ACCOUNTS, USER_NAME } from "@/lib/demo-data";
import {
  readDemoFlag,
  readEmailSession,
  readProfile,
  writeDemoFlag,
  writeEmailSession,
  writeProfile,
  type EmailSession,
} from "@/lib/profile-store";
import { endServerSession, ensureServerSession, type ServerSession } from "@/lib/server-session";
import { useToast } from "@/lib/toast-context";

/** What the email routes answer with. "google" is a wallet account. */
type ServerUser = { address: string; email: string; name?: string; method: "google" | "email" };

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
  const [emailSession, setEmailSession] = useState(readEmailSession);
  const [passwordLogin, setPasswordLogin] = useState<{ address: string; email: string | null } | null>(null);
  // Bumped after saving so the profile is re-read from storage.
  const [profileRevision, setProfileRevision] = useState(0);
  const [server, setServer] = useState<{ address: string; status: ServerSession } | null>(null);
  // Bumped to ask the wallet to sign again after it declined.
  const [attempt, setAttempt] = useState(0);
  const toast = useToast();
  const walletName = connection.wallet?.name ?? "your wallet";
  const walletIcon = connection.wallet?.icon;

  const walletAddress = connection.isConnected && connection.account ? connection.account.address : null;

  const session: Session | null = useMemo(() => {
    if (walletAddress) return { method: "wallet", address: walletAddress, name: "" };
    if (emailSession) {
      const { method, ...rest } = emailSession;
      return { method, ...rest, viaPassword: true };
    }
    return demo ? DEMO_SESSION : null;
  }, [walletAddress, emailSession, demo]);

  // Prove the session to the backend so its data routes trust this address.
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    ensureServerSession(session, async (message) => (await dAppKit.signPersonalMessage({ message })).signature).then(
      async (status) => {
        // The saved profile lives on the backend; keep the browser copy in step with it.
        if (status === "verified") {
          const me = await api<{ profile: Profile | null; passwordEmail?: string | null }>("/me").catch(() => null);
          if (!cancelled && me) setPasswordLogin({ address: session.address, email: me.passwordEmail ?? null });
          if (!cancelled && me?.profile) {
            writeProfile(session.address, me.profile);
            setProfileRevision((n) => n + 1);
          }
        }
        if (cancelled) return;
        setServer({ address: session.address, status });
        if (status === "failed" && session.viaPassword) {
          // The cookie expired or was cleared; only the password can start a new one.
          writeEmailSession(null);
          setEmailSession(null);
          toast.info({ title: "Your session ended", description: "Sign in again with your email and password." });
        }
        if (status === "failed" && session.method === "wallet" && !session.viaPassword) {
          toast.error({
            title: "Sovra couldn't confirm your wallet",
            description: `Sign the message in ${walletName} so Sovra can load your data. It's free and can't move money.`,
            media: walletIcon ? <WalletFailedBadge icon={walletIcon} /> : undefined,
            action: { label: "Sign again", onClick: () => setAttempt((n) => n + 1) },
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [session, dAppKit, attempt, toast, walletName, walletIcon]);

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
      writeEmailSession(null);
      setEmailSession(null);
      await dAppKit.connectWallet({ wallet });
    },
    [dAppKit],
  );

  /** Both email routes answer `{ user }` and set the session cookie. */
  const startEmailSession = useCallback((user: ServerUser) => {
    const next: EmailSession = {
      address: user.address,
      email: user.email,
      name: user.name ?? "",
      method: user.method === "email" ? "email" : "wallet",
    };
    writeDemoFlag(false);
    setDemo(false);
    writeEmailSession(next);
    // The session effect confirms the cookie with /me and loads the saved profile before the app opens.
    setEmailSession(next);
  }, []);

  const signUpWithEmail = useCallback<AuthState["signUpWithEmail"]>(
    async (input) => {
      const { user } = await api<{ user: ServerUser }>("/auth/signup", {
        method: "POST",
        json: input,
      });
      startEmailSession(user);
    },
    [startEmailSession],
  );

  const signInWithEmail = useCallback<AuthState["signInWithEmail"]>(
    async (input) => {
      const { user } = await api<{ user: ServerUser }>("/auth/login", {
        method: "POST",
        json: input,
      });
      startEmailSession(user);
    },
    [startEmailSession],
  );

  const setEmailSignIn = useCallback<AuthState["setEmailSignIn"]>(
    async (input) => {
      const { user } = await api<{ user: ServerUser }>("/auth/password", { method: "POST", json: input });
      setPasswordLogin({ address: user.address, email: user.email });
      if (emailSession) startEmailSession(user);
    },
    [emailSession, startEmailSession],
  );

  const passwordEmail = session && passwordLogin?.address === session.address ? passwordLogin.email : null;

  const startDemo = useCallback(() => {
    writeDemoFlag(true);
    setDemo(true);
  }, []);

  const signOut = useCallback(async () => {
    endServerSession();
    if (connection.isConnected) await dAppKit.disconnectWallet();
    writeDemoFlag(false);
    setDemo(false);
    writeEmailSession(null);
    setEmailSession(null);
  }, [dAppKit, connection.isConnected]);

  // A data route answered 401 after the session was verified: it ended on the server, so end it here too.
  useEffect(() => {
    if (serverStatus !== "verified") return;
    const onUnauthorized = () => {
      void signOut();
      toast.info({ title: "Your session ended", description: "Sign in again to continue." });
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized, { once: true });
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [serverStatus, signOut, toast]);

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
    () => ({
      status,
      session,
      profile,
      server: serverStatus,
      signInWithWallet,
      signUpWithEmail,
      signInWithEmail,
      passwordEmail,
      setEmailSignIn,
      startDemo,
      signOut,
      saveProfile,
    }),
    [
      status,
      session,
      profile,
      serverStatus,
      signInWithWallet,
      signUpWithEmail,
      signInWithEmail,
      passwordEmail,
      setEmailSignIn,
      startDemo,
      signOut,
      saveProfile,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
