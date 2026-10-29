import { CircleCheck, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { budgetViews, useAppData } from "@/lib/app-data";
import { longDate, money, monthName } from "@/lib/format";
import { useToast } from "@/lib/toast-context";

const NETFLIX_ACCOUNT_URL = "https://www.netflix.com/account";

/**
 * The renewal warning on the overview. Its text and actions follow the data:
 * pausing Netflix really removes the renewal from the budget, frees money
 * before payday and saves a decision memory.
 */
export function EntertainmentInsight() {
  const { data, setRecurringStatus, addMemory, removeMemory, markAnswered } = useAppData();
  const toast = useToast();
  const ent = budgetViews(data).find((b) => b.category === "entertainment");
  const netflix = data.recurring.find((r) => /netflix/i.test(r.merchant));
  if (!ent || !netflix) return null;
  const INSIGHT_ID = `entertainment-over-${data.today.slice(0, 7)}`;
  const NETFLIX_ID = netflix.id;
  // Wording comes from the user's own data: the renewal's month and weekday, and their first goal.
  const month = monthName(netflix.next);
  const weekday = longDate(netflix.next).split(",")[0];
  const goal = data.goals[0]?.name.toLowerCase();
  const others = data.recurring
    .filter((r) => r.id !== netflix.id && r.status === "active" && r.category === "entertainment" && r.next <= data.monthEnd)
    .map((r) => r.merchant);
  const keptNames = ["Netflix", ...others].join(" and ");

  const pausedByUser = netflix.status === "paused";
  const kept = data.answered.includes(INSIGHT_ID);

  function pause() {
    setRecurringStatus(NETFLIX_ID, "paused");
    const memoryId = addMemory({
      kind: "decision",
      text: `You paused Netflix in ${month} to stay under your entertainment limit.`,
      highlight: `paused Netflix in ${month}`,
      source: "You chose on the overview",
    });
    toast.success({
      title: "Netflix paused in Sovra",
      description: `Entertainment drops to ${money(ent!.projected - netflix!.amount, { whole: true })} and ${money(netflix!.amount)} is freed before payday.`,
      action: {
        label: "Undo",
        onClick: () => {
          setRecurringStatus(NETFLIX_ID, "active");
          removeMemory(memoryId);
        },
      },
    });
  }

  function keepBoth() {
    markAnswered(INSIGHT_ID, true);
    const memoryId = addMemory({
      kind: "decision",
      text: `You kept ${keptNames} in ${month}, even over your entertainment limit.`,
      highlight: `kept ${keptNames}`,
      source: "You chose on the overview",
    });
    toast.info({
      title: "Keeping both",
      description: "Saved to memory. Sovra won't ask again this month.",
      action: {
        label: "Undo",
        onClick: () => {
          markAnswered(INSIGHT_ID, false);
          removeMemory(memoryId);
        },
      },
    });
  }

  function resume() {
    setRecurringStatus(NETFLIX_ID, "active");
    toast.info({ title: "Netflix is counted again", description: "Its renewal is back in your entertainment budget." });
  }

  if (pausedByUser) {
    return (
      <div className="flex flex-col gap-3">
        <p className="flex items-start gap-2.5 font-medium text-gain">
          <CircleCheck className="mt-0.5 size-5 shrink-0" aria-hidden />
          Netflix is paused. Entertainment ends the month at {money(ent.projected, { whole: true })} of{" "}
          {money(ent.limit, { whole: true })}
          {goal ? `, and the ${goal} stays on track.` : "."}
        </p>
        <p className="text-[14px] text-muted">
          Sovra can't change your Netflix account. Pause or cancel it there too, or the charge still goes through on{" "}
          {weekday}.
        </p>
        <div className="flex flex-wrap gap-2">
          <a href={NETFLIX_ACCOUNT_URL} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-lg bg-cobalt px-4 text-sm font-semibold text-white hover:bg-cobalt-deep">
            Open Netflix account
            <ExternalLink className="size-4" aria-hidden />
          </a>
          <Button variant="secondary" onClick={resume}>
            Count it again
          </Button>
        </div>
      </div>
    );
  }

  if (!ent.over) {
    return (
      <p className="flex items-start gap-2.5 font-medium text-gain">
        <CircleCheck className="mt-0.5 size-5 shrink-0" aria-hidden />
        Entertainment is on track: {money(ent.projected, { whole: true })} of {money(ent.limit, { whole: true })} with
        renewals counted.
      </p>
    );
  }

  if (kept) {
    return (
      <p className="text-muted">
        You chose to keep both. Entertainment will end the month at {money(ent.projected, { whole: true })}, and Sovra will
        check your limit again next month.
      </p>
    );
  }

  return (
    <>
      <p className="mb-4 max-w-[60ch]">
        {ent.renewalSentence}. That takes entertainment to {money(ent.projected, { whole: true })},{" "}
        {money(ent.projected - ent.limit, { whole: true })} over the limit you set. Pausing Netflix this month
        {goal ? ` keeps the ${goal} on track.` : " brings it back under."}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={pause}>Pause Netflix</Button>
        <Button variant="secondary" onClick={keepBoth}>
          Keep both
        </Button>
      </div>
    </>
  );
}
