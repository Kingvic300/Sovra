import { useEffect } from "react";
import { Outlet, useLocation } from "react-router";
import { RequireOnboarded, RequireSession } from "@/components/auth/guards";
import { Sidebar } from "@/components/shell/sidebar";
import { TabBar } from "@/components/shell/tab-bar";
import { SkipLink } from "@/components/shell/skip-link";
import { Topbar } from "@/components/shell/topbar";
import { PageSkeleton } from "@/components/ui/skeleton";
import { shellStats, useAppData } from "@/lib/app-data";

export function AppLayout() {
  const { data } = useAppData();
  const stats = shellStats(data);
  const { pathname } = useLocation();

  // Lets fixed elements (toasts) clear the bottom tab bar on phones.
  useEffect(() => {
    document.body.classList.add("has-tabbar");
    return () => document.body.classList.remove("has-tabbar");
  }, []);
  return (
    <RequireSession>
      <RequireOnboarded>
        <div className="min-h-dvh lg:flex">
          <SkipLink />
          <Sidebar stats={stats} />
          <div className="flex min-w-0 flex-1 flex-col">
            <Topbar stats={stats} />
            {/* Full width beside the sidebar; pages widen their grids instead of centering. */}
            <main id="main" tabIndex={-1} className="min-w-0 flex-1 px-4 pt-6 pb-[calc(env(safe-area-inset-bottom)+6.5rem)] sm:px-6 lg:px-10 lg:py-8 2xl:px-12">
              {data.source === "loading" ? (
                <PageSkeleton pathname={pathname} />
              ) : (
                <Outlet />
              )}
            </main>
          </div>
          <TabBar stats={stats} />
        </div>
      </RequireOnboarded>
    </RequireSession>
  );
}
