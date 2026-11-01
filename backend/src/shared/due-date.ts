import { z } from "zod";

/** YYYY-MM-DD in UTC. */
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * True when the date has passed. "Today" is taken a day early so a user ahead of UTC can
 * still pick their own today.
 */
export const isPastDue = (day: string, now = new Date()) => day < isoDay(new Date(now.getTime() - 86_400_000));

/** A real calendar date as YYYY-MM-DD. Says nothing about whether it has passed. */
export const calendarDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "due must be YYYY-MM-DD")
  .refine((s) => !Number.isNaN(Date.parse(s)) && isoDay(new Date(s)) === s, "due must be a real date");

/** A goal's due date: a real calendar date that hasn't passed. */
export const futureDueDate = calendarDay.refine((s) => !isPastDue(s), "due can't be in the past");
