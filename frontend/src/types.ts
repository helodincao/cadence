/* Domain types for the calendar shell.
   These mirror the "Key concepts" table in docs/PLAN.md — keep them
   in sync as the data model grows (WorkBlock, Task, Constraint, ...). */

export type CalendarId = string;

export interface Calendar {
  id: CalendarId;
  name: string;
  color: string; // hex, drives the event tint
  visible: boolean; // toggled from the sidebar, like Google Calendar
}

/** A "fixed" event has a set time you don't move (lecture, shift, meeting).
 *  A "block" is an AI-suggested work block for a task — draggable later. */
export type EventKind = "fixed" | "block";

export interface CalEvent {
  id: string;
  calendarId: CalendarId;
  title: string;
  /** The calendar date this event sits on, ISO "YYYY-MM-DD". */
  date: string;
  /** Start/end as decimal hours in 24h time, e.g. 13.5 = 1:30 PM. */
  start: number;
  end: number;
  kind: EventKind;
  /** A block the user pinned/moved; re-planning flows around it. */
  locked?: boolean;
  /** Set on scheduler-generated work blocks; links back to the Task. */
  taskId?: string;
}

/** User scheduling preferences (the "questionnaire"). These are turned into a
 *  SchedulerConfig and drive where the scheduler is allowed to place work. */
export interface Settings {
  /** Daily work window (grid hours, 8–21). */
  workDayStart: number;
  workDayEnd: number;
  /** Longest single focus block, in hours. */
  maxFocusHours: number;
  /** Cap on total scheduled work per day, in hours. */
  maxWorkHoursPerDay: number;
  /** Whether Saturday/Sunday may be scheduled. */
  includeWeekends: boolean;
  /** A protected no-work window repeated every day (e.g. lunch). */
  breakEnabled: boolean;
  breakStart: number;
  breakEnd: number;
}

/** Task priority, low → high. Drives scheduling order and time given. */
export type Priority = "low" | "med" | "high";

/** A thing to get done with a deadline and an effort estimate, but no fixed
 *  time — this is what the scheduler places onto the calendar as work blocks. */
export interface Task {
  id: string;
  calendarId: CalendarId;
  title: string;
  /** Due date, ISO "YYYY-MM-DD". */
  dueDate: string;
  /** Total estimated effort in hours. */
  effortHours: number;
  priority: Priority;
  done?: boolean;
}
