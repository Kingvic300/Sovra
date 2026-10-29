import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { Logo } from "@/components/shell/logo";
import { useAuth } from "@/lib/auth-context";
import { ROUTE_GUARDS_ENABLED } from "@/lib/config";

export function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center" role="status" aria-label="Loading Sovra">
      <Logo className="size-10 animate-pulse motion-reduce:animate-none" />
    </div>
  );
}

/** Signed-in users only. Sends everyone else to sign in, then back here. */
export function RequireSession({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  if (!ROUTE_GUARDS_ENABLED) return children;
  if (status === "loading") return <Splash />;
  if (status === "signed-out") return <Navigate to="/signin" replace state={{ from: location.pathname }} />;
  return children;
}

/** Signed-in users who finished onboarding. */
export function RequireOnboarded({ children }: { children: ReactNode }) {
  const { profile, server } = useAuth();
  if (!ROUTE_GUARDS_ENABLED) return children;
  // A returning user's profile arrives with the backend session, so wait for it before deciding.
  if (!profile && server === "checking") return <Splash />;
  if (!profile?.onboarded) return <Navigate to="/onboarding" replace />;
  return children;
}
