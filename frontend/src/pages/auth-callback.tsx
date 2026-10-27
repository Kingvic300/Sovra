import { Navigate } from "react-router";
import { Logo } from "@/components/shell/logo";

/**
 * Google redirects the zkLogin popup here. The Sovra window that opened the
 * popup reads the token from this URL and closes it. If someone lands here
 * directly, send them into the app.
 */
export default function AuthCallbackPage() {
  if (!window.opener) return <Navigate to="/app" replace />;
  return (
    <div className="grid min-h-dvh place-items-center text-center" role="status">
      <div>
        <Logo className="mx-auto size-10 animate-pulse motion-reduce:animate-none" />
        <p className="mt-4 font-semibold">Finishing sign-in</p>
        <p className="text-muted">This window closes on its own.</p>
      </div>
    </div>
  );
}
