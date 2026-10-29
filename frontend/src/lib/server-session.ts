import { normalizeSuiAddress } from "@mysten/sui/utils";
import { api, ApiError } from "@/lib/api";
import type { Session } from "@/lib/auth-context";

/**
 * Whether the backend knows who this browser is.
 * - "verified": the backend set a session cookie for this address.
 * - "unavailable": no backend is reachable (e.g. a static deploy). The app keeps working on local data.
 * - "failed": the backend refused the sign-in, so its data routes will answer 401.
 */
export type ServerSession = "idle" | "checking" | "verified" | "unavailable" | "failed";

/** The backend still calls signed-in wallet users "google", from when sign-in used zkLogin. */
type ServerUser = { address: string; method: "google" | "email" | "demo" };

/** True when the error means there is no Sovra backend behind /api, rather than a refusal. */
function isUnavailable(err: unknown) {
  return err instanceof ApiError && (err.status === 0 || err.status === 404 || err.status >= 500);
}

/** The current backend session, or null when there isn't one. */
async function currentServerUser(): Promise<ServerUser | null> {
  try {
    // A static host answers /api with index.html, which api() returns as null.
    const me = await api<{ user: ServerUser } | null>("/me");
    if (!me?.user) throw new ApiError(404, "no_backend", "No backend");
    return me.user;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  }
}

/** Demo visitors each get their own random server-side address, so any live demo session counts. */
function matches(user: ServerUser | null, session: Session) {
  if (!user) return false;
  if (session.method === "demo") return user.method === "demo";
  const method = session.method === "email" ? "email" : "google";
  return user.method === method && normalizeSuiAddress(user.address) === normalizeSuiAddress(session.address);
}

/**
 * Makes sure the backend has a session for `session`. Wallet users prove they own the
 * address by signing a one-time challenge; the demo account needs no proof.
 */
export async function ensureServerSession(
  session: Session,
  sign: (message: Uint8Array) => Promise<string>,
): Promise<ServerSession> {
  try {
    if (matches(await currentServerUser(), session)) return "verified";
    if (session.method === "demo") {
      await api("/auth/demo", { method: "POST" });
      return "verified";
    }
    // An email session can only be restored by signing in again with the password.
    if (session.method === "email") return "failed";
    const { message } = await api<{ message: string }>("/auth/nonce", { method: "POST", json: { address: session.address } });
    const signature = await sign(new TextEncoder().encode(message));
    await api("/auth/verify", {
      method: "POST",
      json: { address: session.address, message, signature, name: session.name || undefined, email: session.email },
    });
    return "verified";
  } catch (err) {
    if (isUnavailable(err)) return "unavailable";
    console.warn("Sovra backend sign-in failed", err);
    return "failed";
  }
}

/** Clears the backend cookie. Best effort: signing out locally must never wait on the network. */
export function endServerSession() {
  api("/auth/logout", { method: "POST" }).catch(() => {});
}
