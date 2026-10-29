import { createContext, useContext, type ReactNode } from "react";

export type ToastTone = "success" | "error" | "info";

export type ToastInput = {
  title: string;
  description?: string;
  /** Optional button, e.g. Undo. */
  action?: { label: string; onClick: () => void };
  /** Replaces the tone icon, e.g. a wallet logo. */
  media?: ReactNode;
  /** Milliseconds before auto-dismiss. Errors stay longer by default. */
  duration?: number;
};

export type Toast = ToastInput & { id: number; tone: ToastTone };

export type ToastApi = {
  success: (input: ToastInput | string) => number;
  error: (input: ToastInput | string) => number;
  info: (input: ToastInput | string) => number;
  dismiss: (id: number) => void;
};

export const ToastContext = createContext<ToastApi | null>(null);

export function useToast() {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast must be used inside <ToastProvider>");
  return api;
}
