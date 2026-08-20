/* Time helpers for the week grid. Hours are decimal 24h values
   (13.5 === 1:30 PM). Day index is 0 = Monday … 6 = Sunday. */

/** First and last hour the grid renders, and the row height in px. */
export const START_HOUR = 8;
export const END_HOUR = 21; // 9 PM
export const HOUR_HEIGHT = 52; // must match --hour-height in index.css
export const GUTTER_WIDTH = 62; // must match --gutter-width in index.css

export const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** The list of hour marks drawn in the gutter, e.g. [8, 9, …, 20]. */
export const HOURS: number[] = Array.from(
  { length: END_HOUR - START_HOUR },
  (_, i) => START_HOUR + i,
);

/** Monday 00:00 of the week containing `date`. */
export function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const mondayIndex = (d.getDay() + 6) % 7; // JS: 0 = Sunday
  d.setDate(d.getDate() - mondayIndex);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

/** Weekday index for a date, Mon = 0 … Sun = 6. */
export function weekdayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

/** Midnight of the given date (strips the time). */
export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Local ISO date string "YYYY-MM-DD" (not UTC — avoids off-by-one). */
export function toISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Parse "YYYY-MM-DD" into a local Date at midnight. */
export function fromISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "Aug 20" from an ISO date, for compact due-date labels. */
export function formatShortDate(iso: string): string {
  const d = fromISO(iso);
  return `${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** 24-hour HUD clock label: 9 → "09:00", 13.5 → "13:30". */
export function formatTime(hour: number): string {
  const h = Math.floor(hour);
  const minutes = Math.round((hour - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** "09:00–10:00" — a time range in 24-hour readout form. */
export function formatRange(start: number, end: number): string {
  return `${formatTime(start)}–${formatTime(end)}`;
}

/** Round a decimal hour to the nearest 5 minutes. */
export function snap5(hour: number): number {
  return Math.round(hour * 12) / 12;
}

/** Decimal hour → "HH:MM" (5-min) for a native <input type="time">. */
export function toHM(hour: number): string {
  return formatTime(snap5(hour));
}

/** "HH:MM" from a time input → decimal hour (e.g. "12:20" → 12.333…). */
export function fromHM(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return (h || 0) + (m || 0) / 60;
}

/** Vertical offset (px) of an hour from the top of the grid body. */
export function hourToOffset(hour: number): number {
  return (hour - START_HOUR) * HOUR_HEIGHT;
}
