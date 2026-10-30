import type { ReactNode } from "react";

// Placeholder address. The owner must replace this with a monitored inbox before launch.
export const CONTACT_EMAIL = "hello@sovra.app";

export const LAST_UPDATED = "30 October 2026";

export type LegalSection = {
  id: string;
  title: string;
  body: ReactNode;
};
