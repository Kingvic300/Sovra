import { Outlet, ScrollRestoration } from "react-router";
import { AuthProvider } from "@/components/auth/auth-provider";
import { AppDataProvider } from "@/components/data/app-data-provider";
import { ToastProvider } from "@/components/ui/toast-provider";

export function RootLayout() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AppDataProvider>
          <Outlet />
          <ScrollRestoration />
        </AppDataProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
