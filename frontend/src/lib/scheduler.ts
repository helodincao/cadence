/* The deterministic scheduler — the heart of the app.
 *
 * Pure function: given the tasks, the already-busy events, a config, and the
 * date to start planning from, it returns fresh work-block events on real
 * dates. No React, no side effects, no randomness beyond block ids. The LLM
 * only *advises* this; it does not replace it. See docs/PLAN.md §7.
 *
 * Strategy: rank tasks by priority → urgency → effort, then greedily drop each
 * task's hours into free slots on dates from `planStart` up to its due date,
 * spread across days, capped per day, skipping weekends/breaks per config.
 */

import type { CalEvent, Settings, Task } from "../types";
import { addDays, END_HOUR, fromISO, START_HOUR, toISO, weekdayIndex } from "./time";
import { uid } from "./id";

export interface SchedulerConfig {
  dayStart: number;
  dayEnd: number;
  maxBlockHours: number;
  minBlockHours: number;
  maxWorkHoursPerDay: number;
  includeWeekends: boolean;
  dailyBusy: { start: number; end: number }[];
}

export const DEFAULT_CONFIG: SchedulerConfig = {
  dayStart: START_HOUR,
  dayEnd: END_HOUR,
  maxBlockHours: 2,
  minBlockHours: 1,
  maxWorkHoursPerDay: 4,
  includeWeekends: true,
  dailyBusy: [],
};

export const DEFAULT_SETTINGS: Settings = {
  workDayStart: START_HOUR,
  workDayEnd: END_HOUR,
  maxFocusHours: 2,
  maxWorkHoursPerDay: 4,
  includeWeekends: true,
  breakEnabled: false,
  breakStart: 12,
  breakEnd: 13,
};

export function configFromSettings(s: Settings): SchedulerConfig {
  return {
    dayStart: s.workDayStart,
    dayEnd: s.workDayEnd,
    maxBlockHours: s.maxFocusHours,
    minBlockHours: Math.min(1, s.maxFocusHours),
    maxWorkHoursPerDay: s.maxWorkHoursPerDay,
    includeWeekends: s.includeWeekends,
    dailyBusy:
      s.breakEnabled && s.breakEnd > s.breakStart
        ? [{ start: s.breakStart, end: s.breakEnd }]
        : [],
  };
}

const PRIORITY_RANK: Record<Task["priority"], number> = { high: 3, med: 2, low: 1 };
const MAX_PLAN_DAYS = 366; // safety bound on the day loop

interface Interval {
  start: number;
  end: number;
}

function mergeBusy(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];
  for (const iv of sorted) {
    const last = merged[merged.length - 1];
    if (last && iv.start <= last.end) last.end = Math.max(last.end, iv.end);
    else merged.push({ ...iv });
  }
  return merged;
}

function freeFromBusy(busy: Interval[], dayStart: number, dayEnd: number): Interval[] {
  const clipped = busy
    .map((b) => ({ start: Math.max(b.start, dayStart), end: Math.min(b.end, dayEnd) }))
    .filter((b) => b.end > b.start);
  const merged = mergeBusy(clipped);
  const free: Interval[] = [];
  let cursor = dayStart;
  for (const b of merged) {
    if (b.start > cursor) free.push({ start: cursor, end: b.start });
    cursor = Math.max(cursor, b.end);
  }
  if (cursor < dayEnd) free.push({ start: cursor, end: dayEnd });
  return free;
}

const snapDown = (hours: number) => Math.floor(hours * 2) / 2;

/**
 * Produce work blocks for the given tasks around the busy events, on real
 * dates from `planStartISO` (inclusive) up to each task's due date.
 */
export function schedule(
  tasks: Task[],
  busyEvents: CalEvent[],
  config: SchedulerConfig,
  planStartISO: string,
): CalEvent[] {
  const {
    dayStart,
    dayEnd,
    maxBlockHours,
    minBlockHours,
    maxWorkHoursPerDay,
    includeWeekends,
    dailyBusy,
  } = config;

  // Group busy time and existing block-hours by date.
  const busyByDate = new Map<string, Interval[]>();
  const workUsedByDate = new Map<string, number>();
  for (const e of busyEvents) {
    const arr = busyByDate.get(e.date) ?? [];
    arr.push({ start: e.start, end: e.end });
    busyByDate.set(e.date, arr);
    if (e.kind === "block") {
      workUsedByDate.set(e.date, (workUsedByDate.get(e.date) ?? 0) + (e.end - e.start));
    }
  }

  // Hours already covered by each task's locked blocks.
  const lockedHours = new Map<string, number>();
  for (const e of busyEvents) {
    if (e.kind === "block" && e.taskId && e.locked) {
      lockedHours.set(e.taskId, (lockedHours.get(e.taskId) ?? 0) + (e.end - e.start));
    }
  }

  // Free intervals are computed lazily per date and shared across tasks.
  const freeByDate = new Map<string, Interval[]>();
  const freeFor = (iso: string): Interval[] => {
    let f = freeByDate.get(iso);
    if (!f) {
      f = freeFromBusy([...(busyByDate.get(iso) ?? []), ...dailyBusy], dayStart, dayEnd);
      freeByDate.set(iso, f);
    }
    return f;
  };

  const ordered = tasks
    .filter((t) => !t.done)
    .sort(
      (a, b) =>
        PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] ||
        a.dueDate.localeCompare(b.dueDate) ||
        b.effortHours - a.effortHours,
    );

  const planStart = fromISO(planStartISO);
  const blocks: CalEvent[] = [];

  for (const task of ordered) {
    let remaining = task.effortHours - (lockedHours.get(task.id) ?? 0);
    if (remaining < minBlockHours) continue;

    const due = fromISO(task.dueDate);
    let cursor = planStart;
    let guard = 0;

    while (cursor <= due && remaining >= minBlockHours && guard < MAX_PLAN_DAYS) {
      guard++;
      const iso = toISO(cursor);
      const isWeekend = weekdayIndex(cursor) >= 5;
      if (!(!includeWeekends && isWeekend)) {
        let dayBudget = maxWorkHoursPerDay - (workUsedByDate.get(iso) ?? 0);
        if (dayBudget >= minBlockHours) {
          for (const slot of freeFor(iso)) {
            if (remaining < minBlockHours || dayBudget < minBlockHours) break;
            const available = slot.end - slot.start;
            if (available < minBlockHours) continue;
            const chunk = snapDown(
              Math.min(remaining, maxBlockHours, available, dayBudget),
            );
            if (chunk < minBlockHours) continue;

            blocks.push({
              id: uid(),
              calendarId: task.calendarId,
              title: task.title,
              date: iso,
              start: slot.start,
              end: slot.start + chunk,
              kind: "block",
              taskId: task.id,
            });
            slot.start += chunk;
            remaining -= chunk;
            dayBudget -= chunk;
            workUsedByDate.set(iso, (workUsedByDate.get(iso) ?? 0) + chunk);
          }
        }
      }
      cursor = addDays(cursor, 1);
    }
  }

  return blocks;
}
