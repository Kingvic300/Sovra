import { Link } from "react-router";
import { MessageSquareText } from "lucide-react";
import { EntertainmentInsight } from "@/components/overview/entertainment-insight";
import { TransactionRow } from "@/components/transactions/transaction-row";
import { Panel } from "@/components/ui/panel";
import { Progress } from "@/components/ui/progress";
import { budgetTone } from "@/lib/budget-tone";
import { Remembered } from "@/components/ui/remembered";
import { Sparkline } from "@/components/ui/sparkline";
import { CATEGORIES } from "@/lib/demo-data";
import { longDate, money, monthName, niceAmount, shortDate, splitMoney } from "@/lib/format";
import { budgetViews, currencyOf, freeUntilPayday, useAppData } from "@/lib/app-data";
import { firstName, useAuth } from "@/lib/auth-context";
import { useTitle } from "@/lib/use-title";

export default function OverviewPage() {
  useTitle();
  const auth = useAuth();
  const { data } = useAppData();
  const [whole, cents] = data.total === null ? ["—", ""] : splitMoney(data.total);
  const free = freeUntilPayday(data);
  const recent = [...data.memories].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
  const goalMemory = data.memories.find((m) => m.kind === "goal");
  const budgets = budgetViews(data);
  const goal = data.goals[0];

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[13px] text-muted">{longDate(data.today)}</p>
          <h1 className="text-[26px] font-bold tracking-[-0.02em]">{firstName(auth) ? `Hi, ${firstName(auth)}` : "Hi there"}</h1>
        </div>
        <Link
          to="/app/ask"
          className="flex h-10 items-center gap-2 rounded-full bg-cobalt-soft px-4 text-[14px] font-semibold text-cobalt transition-colors hover:bg-cobalt hover:text-white"
        >
          <MessageSquareText className="size-4" aria-hidden />
          Can I afford a {money(niceAmount(300, data.perUsd), { whole: true })} phone this month?
        </Link>
      </header>

      {/* Balance */}
      <Panel className="!p-0">
        <div className="grid items-end gap-6 px-6 pt-6 pb-5 sm:px-7 md:grid-cols-2">
          <div>
            <p className="text-muted">
              {data.accounts.length
                ? `Across ${data.accounts.length} ${data.accounts.length === 1 ? "account" : "accounts"}`
                : "No accounts yet. Import a statement to see your balance."}
            </p>
            <p className="mt-1 text-[44px] leading-none font-extrabold tracking-[-0.03em] tabular-nums sm:text-[56px]">
              {whole}
              <span className="text-[0.5em] text-muted">{cents}</span>
            </p>
            {data.fx && (
              <p className="mt-1 text-[12px] text-muted">
                Converted to {data.currency} at {money(data.perUsd, { currency: data.currency })} per $1 on {shortDate(data.fx.date)}. Rates by{" "}
                <a href={data.fx.source.url} target="_blank" rel="noreferrer" className="underline hover:text-ink">
                  {data.fx.source.name}
                </a>
                .
              </p>
            )}
            {free >= 0 ? (
              <p className="mt-2 font-medium text-gain">+{money(free, { whole: true })} left this month after bills</p>
            ) : (
              <p className="mt-2 font-medium text-over">{money(-free, { whole: true })} short of bills before payday</p>
            )}
          </div>
          {data.balanceHistory.length > 1 && <Sparkline data={data.balanceHistory} className="h-[72px] w-full text-cobalt" />}
        </div>
        <ul className="grid border-t border-line sm:grid-cols-3">
          {data.accounts.map((a) => (
            <li key={a.id} className="border-line px-6 py-3.5 not-first:border-t sm:px-7 sm:not-first:border-t-0 sm:not-first:border-l">
              <p className="flex items-center gap-2 text-[13px] text-muted">
                {a.name}
                {a.source === "tatum" && a.status === "live" && (
                  <span className="rounded-full bg-cobalt-soft px-2 py-px text-[11px] font-semibold text-cobalt">Live via Tatum</span>
                )}
              </p>
              <p className="font-semibold tabular-nums">{a.balance === null ? <span className="text-muted">Not known</span> : money(a.balance, { currency: a.currency })}</p>
            </li>
          ))}
        </ul>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-[1.15fr_1fr]">
        {/* Memory + insight */}
        <Panel
          title="What Sovra remembers"
          action={
            <Link to="/app/memory" className="text-[13px] font-semibold text-cobalt hover:underline">
              All memories
            </Link>
          }
        >
          <ul className="flex flex-col gap-2.5">
            {recent.map((m) => (
              <li key={m.id} className="grid grid-cols-[52px_1fr] items-baseline gap-3">
                <span className="text-xs tabular-nums text-muted">{shortDate(m.date)}</span>
                <p>
                  <Remembered text={m.text} highlight={m.highlight} />
                </p>
              </li>
            ))}
          </ul>
          {recent.length === 0 && (
            <p className="text-muted">Nothing yet. Set a goal or a limit, or change a category, and Sovra remembers it here.</p>
          )}
          <div className="mt-4 border-t border-line pt-4">
            <EntertainmentInsight />
          </div>
        </Panel>

        {/* Budgets */}
        <Panel
          title={`${monthName(data.today)} budgets`}
          action={
            <Link to="/app/budgets" className="text-[13px] font-semibold text-cobalt hover:underline">
              All budgets
            </Link>
          }
        >
          {budgets.length === 0 && (
            <p className="text-muted">
              No budgets yet.{" "}
              <Link to="/app/budgets" className="font-semibold text-cobalt hover:underline">
                Add one
              </Link>{" "}
              and Sovra counts renewals before they land.
            </p>
          )}
          <ul className="flex flex-col gap-4">
            {budgets.slice(0, 4).map((b) => {
              return (
                <li key={b.category}>
                  <div className="flex justify-between gap-3 font-medium">
                    <span>{CATEGORIES[b.category]}</span>
                    <span className="tabular-nums">
                      {money(b.spent, { whole: true })}{" "}
                      <span className="text-[13px] font-normal text-muted">of {money(b.limit, { whole: true })}</span>
                    </span>
                  </div>
                  <div className="mt-1.5">
                    <Progress
                      value={b.spent}
                      max={b.limit}
                      committed={b.committed}
                      tone={budgetTone(b.spent, b.limit, b.committed)}
                      label={`${CATEGORIES[b.category]} budget`}
                    />
                  </div>
                  {b.over && (
                    <p className="mt-1 text-[13px] text-over">
                      {b.committedLabel} take this to {money(b.projected, { whole: true })}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <Panel
          title="Recent transactions"
          action={
            <Link to="/app/transactions" className="text-[13px] font-semibold text-cobalt hover:underline">
              See all
            </Link>
          }
        >
          <ul>
            {data.transactions.slice(0, 5).map((tx) => (
              <TransactionRow key={tx.id} tx={tx} currency={currencyOf(data, tx.accountId)} />
            ))}
          </ul>
          {data.transactions.length === 0 && (
            <p className="text-muted">
              No transactions yet.{" "}
              <Link to="/app/accounts" className="font-semibold text-cobalt hover:underline">
                Import a statement
              </Link>{" "}
              to see them here.
            </p>
          )}
        </Panel>

        {!goal ? (
          <Panel title="Goals">
            <p className="text-muted">No savings goal yet. Add one and Sovra checks every spending question against it.</p>
            <Link to="/app/goals" className="mt-4 inline-block font-semibold text-cobalt hover:underline">
              Add a goal
            </Link>
          </Panel>
        ) : (
        <Panel title={goal.name}>
          <p className="text-[40px] leading-none font-extrabold tracking-[-0.03em] tabular-nums">
            {money(goal.saved, { whole: true })}{" "}
            <span className="text-xl font-bold text-muted">of {money(goal.target, { whole: true })}</span>
          </p>
          <div className="my-4">
            <Progress value={goal.saved} max={goal.target} tone="cobalt" size="lg" label={`${goal.name} progress`} />
          </div>
          <p className="text-muted">{goal.note}</p>
          {goalMemory && (
            <p className="mt-4 border-t border-line pt-3 text-[13px] text-muted">
              Set on {shortDate(goalMemory.date)}: <Remembered text={goalMemory.text} highlight={goalMemory.highlight} />
            </p>
          )}
        </Panel>
        )}
      </div>
    </div>
  );
}
