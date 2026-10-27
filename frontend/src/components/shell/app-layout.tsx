import { Outlet } from "react-router";
import { RequireOnboarded, RequireSession } from "@/components/auth/guards";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { shellStats, useAppData } from "@/lib/app-data";

export function AppLayout() {
  const { data } = useAppData();
  const stats = shellStats(data);
  return (
    <RequireSession>
      <RequireOnboarded>
        <div className="min-h-dvh lg:flex">
          <Sidebar stats={stats} />
          <div className="flex min-w-0 flex-1 flex-col">
            <Topbar stats={stats} />
            {/* Full width beside the sidebar; pages widen their grids instead of centering. */}
            <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8 2xl:px-12">
              <Outlet />
            </main>
          </div>
        </div>
      </RequireOnboarded>
    </RequireSession>
  );
}
