/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public Enoki API key from portal.enoki.mystenlabs.com. Safe to ship to the browser. */
  readonly VITE_ENOKI_API_KEY?: string;
  /** Google OAuth client ID (Web application) registered in Enoki. */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
