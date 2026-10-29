/**
 * Route protection for /app and /onboarding: /app needs a session and finished onboarding.
 * Turn off only to open every screen without signing in while developing.
 */
export const ROUTE_GUARDS_ENABLED = true;
