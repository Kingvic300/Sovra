import type { ReactNode } from "react";

/** Grey placeholder block in the shape of content that is still loading. */
export function Skeleton({ className = "" }: { className?: string }) {
  // Default corners only when the caller didn't pick a shape, so `rounded-full` isn't overridden.
  const corners = /\brounded/.test(className) ? "" : "rounded-md";
  return <span className={`block animate-pulse bg-track motion-reduce:animate-none ${corners} ${className}`} aria-hidden />;
}

function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`rounded-card bg-card p-6 shadow-card ${className}`}>{children}</div>;
}

function Header({ action = true }: { action?: boolean }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-2.5">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-[min(32rem,80vw)]" />
      </div>
      {action && <Skeleton className="h-10 w-32 rounded-lg" />}
    </div>
  );
}

/** Varied widths so placeholder rows read as text, not a grid. */
const LINE_WIDTHS = ["w-2/3", "w-1/2", "w-3/5", "w-5/12", "w-7/12"];

function Lines({ count, className = "" }: { count: number; className?: string }) {
  return (
    <ul className={`flex flex-col divide-y divide-line ${className}`}>
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="flex items-center gap-3 py-3.5 first:pt-0 last:pb-0">
          <Skeleton className="h-4 w-12" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className={`h-4 ${LINE_WIDTHS[i % LINE_WIDTHS.length]}`} />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-4 w-16" />
        </li>
      ))}
    </ul>
  );
}

function Stats({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-card bg-card px-5 py-4 shadow-card">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="mt-2.5 h-7 w-24" />
        </div>
      ))}
    </div>
  );
}

function Bars({ count }: { count: number }) {
  return (
    <ul className="flex flex-col gap-5">
      {Array.from({ length: count }, (_, i) => (
        <li key={i}>
          <div className="flex justify-between gap-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-20" />
          </div>
          <Skeleton className="mt-2 h-2.5 w-full rounded-full" />
        </li>
      ))}
    </ul>
  );
}

function OverviewSkeleton() {
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2.5">
          <Skeleton className="h-3.5 w-40" />
          <Skeleton className="h-8 w-44" />
        </div>
        <Skeleton className="h-10 w-72 rounded-full" />
      </div>
      <Card className="!p-0">
        <div className="grid items-end gap-6 px-6 pt-6 pb-5 sm:px-7 md:grid-cols-2">
          <div>
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-3 h-12 w-64" />
            <Skeleton className="mt-3 h-4 w-56" />
          </div>
          <Skeleton className="h-[72px] w-full" />
        </div>
        <div className="grid border-t border-line sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col gap-2 border-line px-6 py-3.5 not-first:border-t sm:px-7 sm:not-first:border-t-0 sm:not-first:border-l">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      </Card>
      <div className="grid gap-5 lg:grid-cols-[1.15fr_1fr]">
        <Card>
          <Skeleton className="mb-5 h-5 w-48" />
          <Lines count={3} />
        </Card>
        <Card>
          <Skeleton className="mb-5 h-5 w-40" />
          <Bars count={4} />
        </Card>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <Skeleton className="mb-5 h-5 w-44" />
          <Lines count={5} />
        </Card>
        <Card>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="mt-4 h-10 w-48" />
          <Skeleton className="mt-4 h-3 w-full rounded-full" />
          <Skeleton className="mt-4 h-4 w-3/4" />
        </Card>
      </div>
    </>
  );
}

function TransactionsSkeleton() {
  return (
    <>
      <Header action={false} />
      <div className="flex items-center gap-2">
        <Skeleton className="h-10 flex-1 rounded-lg sm:max-w-80 sm:flex-none sm:basis-80" />
        <Skeleton className="ml-auto h-10 w-32 rounded-lg" />
      </div>
      <div className="flex gap-2 overflow-hidden">
        {["w-16", "w-28", "w-24", "w-32", "w-24", "w-28"].map((w, i) => (
          <Skeleton key={i} className={`h-9 shrink-0 rounded-full ${w}`} />
        ))}
      </div>
      <Card>
        <Lines count={8} />
      </Card>
    </>
  );
}

function BudgetsSkeleton() {
  return (
    <>
      <Header />
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <Bars count={6} />
        </Card>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-4 w-48" />
          {[0, 1].map((i) => (
            <Card key={i} className="!p-5">
              <Skeleton className="h-4 w-56" />
              <Skeleton className="mt-3 h-3.5 w-full" />
              <Skeleton className="mt-2 h-3.5 w-4/5" />
              <div className="mt-4 flex gap-2">
                <Skeleton className="h-8 w-32 rounded-lg" />
                <Skeleton className="h-8 w-24 rounded-lg" />
              </div>
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}

function GoalsSkeleton() {
  return (
    <>
      <Header />
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Card key={i}>
            <div className="flex justify-between gap-3">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-20" />
            </div>
            <Skeleton className="mt-5 h-10 w-48" />
            <Skeleton className="mt-4 h-3 w-full rounded-full" />
            <div className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-4">
              {[0, 1, 2].map((j) => (
                <div key={j} className="flex flex-col gap-1.5">
                  <Skeleton className="h-3 w-12" />
                  <Skeleton className="h-4 w-14" />
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}

function ListPageSkeleton({ stats = true, rows = 6 }: { stats?: boolean; rows?: number }) {
  return (
    <>
      <Header action={false} />
      {stats && <Stats />}
      <Card>
        <Lines count={rows} />
      </Card>
    </>
  );
}

function RecurringSkeleton() {
  return (
    <>
      <Header action={false} />
      <Stats />
      <div className="grid items-start gap-5 xl:grid-cols-2">
        <Card>
          <Skeleton className="mb-5 h-5 w-28" />
          <Lines count={3} />
        </Card>
        <Card>
          <Skeleton className="mb-5 h-5 w-20" />
          <Lines count={5} />
        </Card>
      </div>
    </>
  );
}

function AccountsSkeleton() {
  return (
    <>
      <Header action={false} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="mt-5 h-10 w-52" />
          <div className="mt-5 flex flex-col gap-2.5">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-4 w-3/4" />
            ))}
          </div>
        </Card>
        <Card>
          <Skeleton className="mb-5 h-5 w-40" />
          <Lines count={2} />
          <Skeleton className="mt-5 h-36 w-full rounded-card" />
        </Card>
      </div>
    </>
  );
}

function AskSkeleton() {
  return (
    <>
      <Header action={false} />
      <div className="grid items-start gap-5 xl:grid-cols-[1fr_360px]">
        <Card className="flex flex-col gap-6">
          <Skeleton className="h-10 w-64 self-end rounded-2xl" />
          <div className="flex gap-3">
            <Skeleton className="size-8 shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-11/12" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </div>
          <Skeleton className="mt-6 h-12 w-full rounded-full" />
        </Card>
        <div className="flex flex-col gap-5">
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <Skeleton className="mb-4 h-5 w-36" />
              <div className="flex flex-col gap-2.5">
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-4/5" />
              </div>
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}

function ProfileSkeleton() {
  return (
    <>
      <Header action={false} />
      <div className="flex items-center gap-4 rounded-card bg-ink p-6">
        <span className="size-16 shrink-0 animate-pulse rounded-full bg-white/10 motion-reduce:animate-none" />
        <div className="flex flex-col gap-2">
          <span className="h-5 w-40 animate-pulse rounded-md bg-white/10 motion-reduce:animate-none" />
          <span className="h-4 w-56 animate-pulse rounded-md bg-white/10 motion-reduce:animate-none" />
        </div>
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <Card key={i} className="flex flex-col gap-4">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-12 w-full rounded-xl" />
            <Skeleton className="h-12 w-full rounded-xl" />
            <Skeleton className="h-4 w-2/3" />
          </Card>
        ))}
      </div>
    </>
  );
}

const BY_PAGE: Record<string, () => ReactNode> = {
  "/app": OverviewSkeleton,
  "/app/transactions": TransactionsSkeleton,
  "/app/budgets": BudgetsSkeleton,
  "/app/goals": GoalsSkeleton,
  "/app/recurring": RecurringSkeleton,
  "/app/accounts": AccountsSkeleton,
  "/app/memory": () => <ListPageSkeleton rows={7} />,
  "/app/ask": AskSkeleton,
  "/app/profile": ProfileSkeleton,
};

/** The loading layout for an app page, shaped like the page itself so nothing jumps when data arrives. */
export function PageSkeleton({ pathname }: { pathname: string }) {
  const Page = BY_PAGE[pathname.replace(/\/$/, "")] ?? ListPageSkeleton;
  return (
    <div className="flex flex-col gap-6" role="status" aria-label="Loading your money">
      <Page />
    </div>
  );
}
