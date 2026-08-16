/* Seed data for first run / "Reset demo data".
   Uses real dates relative to today, so the demo is populated whenever it runs.
   In later steps this is replaced by real data from the FastAPI backend. */

import type { Calendar, CalEvent, Task } from "../types";
import { addDays, startOfDay, startOfWeek, toISO } from "../lib/time";
import { DEFAULT_CONFIG, schedule } from "../lib/scheduler";

export const sampleCalendars: Calendar[] = [
  { id: "school", name: "School", color: "#ae1d1d", visible: true },
  { id: "lab", name: "Lab", color: "#4dffd2", visible: true },
  { id: "club", name: "Club (SW lead)", color: "#b18cff", visible: true },
  { id: "health", name: "Health", color: "#7dff5e", visible: true },
  { id: "jobs", name: "Job Hunt", color: "#ff6f9c", visible: false },
];

const today = startOfDay(new Date());
const monday = startOfWeek(today);
/** ISO date `weekday` (0=Mon) of week `wk` from this week's Monday. */
const dWk = (wk: number, weekday: number) => toISO(addDays(monday, wk * 7 + weekday));
/** ISO date `n` days from today. */
const dOff = (n: number) => toISO(addDays(today, n));

let n = 0;
const ev = (
  calendarId: string,
  title: string,
  date: string,
  start: number,
  end: number,
): CalEvent => ({ id: `f${n++}`, calendarId, title, date, start, end, kind: "fixed" });

// Fixed commitments across this week + the next two, so week/month nav has content.
const sampleFixedEvents: CalEvent[] = [];
for (let wk = 0; wk < 3; wk++) {
  sampleFixedEvents.push(ev("school", "CSCI 3155 Lecture", dWk(wk, 0), 9, 10));
  sampleFixedEvents.push(ev("lab", "Lab — data runs", dWk(wk, 1), 10, 13));
  sampleFixedEvents.push(ev("school", "CSCI 3155 Lecture", dWk(wk, 2), 9, 10));
  sampleFixedEvents.push(ev("health", "Gym", dWk(wk, 2), 17, 18));
  sampleFixedEvents.push(ev("club", "Club standup", dWk(wk, 3), 12, 13));
  sampleFixedEvents.push(ev("school", "CSCI 3155 Lecture", dWk(wk, 4), 9, 10));
  sampleFixedEvents.push(ev("lab", "Lab meeting + work", dWk(wk, 4), 13, 16));
}

export const sampleTasks: Task[] = [
  { id: "t1", calendarId: "school", title: "PS4 — Interpreters", dueDate: dOff(4), effortHours: 6, priority: "high" },
  { id: "t2", calendarId: "jobs", title: "Apply to 5 SWE roles", dueDate: dOff(5), effortHours: 3, priority: "med" },
  { id: "t3", calendarId: "club", title: "Review club PRs", dueDate: dOff(9), effortHours: 2, priority: "med" },
  { id: "t4", calendarId: "school", title: "Reading — Ch. 7", dueDate: dOff(2), effortHours: 2, priority: "low" },
  { id: "t5", calendarId: "school", title: "Midterm prep", dueDate: dOff(11), effortHours: 6, priority: "high" },
];

// Seed the week already planned (from today), so first run shows the scheduler.
export const sampleEvents: CalEvent[] = [
  ...sampleFixedEvents,
  ...schedule(sampleTasks, sampleFixedEvents, DEFAULT_CONFIG, toISO(today)),
];
