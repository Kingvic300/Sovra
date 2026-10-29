import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/ui/field-class";
import { Chip, Field, MoneyInput } from "@/components/ui/form-controls";
import { Modal } from "@/components/ui/modal";
import { Remembered } from "@/components/ui/remembered";
import { useAppData } from "@/lib/app-data";
import { daysBetween, money } from "@/lib/format";
import { goalMemory, upcomingMonths } from "@/lib/onboarding";
import { useToast } from "@/lib/toast-context";

const IDEAS = ["A laptop", "Rent deposit", "Emergency fund", "Trip home", "New phone"];

function AddGoalForm({ onDone }: { onDone: () => void }) {
  const { data, addGoal, removeGoal, addMemory, removeMemory } = useAppData();
  const [months] = useState(() => upcomingMonths(36, new Date(`${data.today}T00:00:00Z`)));
  const toast = useToast();
  const [name, setName] = useState("");
  const [target, setTarget] = useState(0);
  const [saved, setSaved] = useState(0);
  const [due, setDue] = useState(months[5].value);
  const [errors, setErrors] = useState<{ name?: string; target?: string; saved?: string }>({});

  const weeks = Math.max(1, Math.ceil(daysBetween(data.today, due) / 7));
  const weekly = target > saved ? Math.ceil((target - saved) / weeks) : 0;
  const memory = goalMemory({ goal: { name, target, due } });

  function submit(e: FormEvent) {
    e.preventDefault();
    const next = {
      name: name.trim() ? undefined : "Give the goal a name.",
      target: target > 0 ? undefined : "Enter how much you want to save.",
      saved: saved <= target || !(target > 0) ? undefined : "Saved so far can't be more than the goal.",
    };
    setErrors(next);
    if (next.name || next.target || next.saved) return;

    const goalId = addGoal({
      name: name.trim(),
      target,
      saved,
      due,
      weekly,
      note: weekly ? `Put aside ${money(weekly, { whole: true })} a week and you reach it on time.` : "Already fully saved.",
    });
    const memoryId = memory ? addMemory({ kind: "goal", ...memory, source: "You added a goal" }) : null;
    toast.success({
      title: `${name.trim()} goal added`,
      description: weekly ? `About ${money(weekly, { whole: true })} a week gets you there. Saved to memory.` : "Saved to memory.",
      action: {
        label: "Undo",
        onClick: () => {
          removeGoal(goalId);
          if (memoryId) removeMemory(memoryId);
        },
      },
    });
    onDone();
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="flex flex-col gap-6 px-6 py-6">
        <div>
          <Field label="What are you saving for?" error={errors.name}>
            <input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name your goal" autoFocus />
          </Field>
          <div className="mt-3 flex flex-wrap gap-2">
            {IDEAS.map((i) => (
              <Chip key={i} active={name === i} onClick={() => setName(i)}>
                {i}
              </Chip>
            ))}
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Goal amount" error={errors.target}>
            <MoneyInput value={target} onChange={setTarget} placeholder="1,200" />
          </Field>
          <Field label="Saved so far" error={errors.saved} hint="Leave empty if you're starting from zero.">
            <MoneyInput value={saved} onChange={setSaved} placeholder="0" />
          </Field>
        </div>

        <Field label="By when?">
          <select className={fieldClass} value={due} onChange={(e) => setDue(e.target.value)}>
            {months.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>

        <div className="rounded-xl bg-porcelain px-4 py-3.5 text-[15px]">
          {memory ? (
            <>
              <p className="mb-1 text-[13px] font-semibold text-muted">Sovra will remember</p>
              <Remembered text={memory.text} highlight={memory.highlight} />
              {weekly > 0 && (
                <p className="mt-2 text-[14px] text-muted">
                  That's about <span className="font-semibold text-ink">{money(weekly, { whole: true })} a week</span> for{" "}
                  {weeks} weeks.
                </p>
              )}
            </>
          ) : (
            <p className="text-muted">Name the goal and set an amount to see the weekly plan.</p>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-line px-6 py-4">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">Add goal</Button>
      </div>
    </form>
  );
}

export function AddGoalDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Add a goal" description="Sovra checks every spending question against your goals.">
      <AddGoalForm onDone={onClose} />
    </Modal>
  );
}
