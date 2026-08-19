/* Calendar colors.
 *
 * Chosen as saturated mid-tones (not neon) so each reads clearly on BOTH the
 * dark and light themes — as a left-edge accent, a tinted fill, and as block
 * title text. Shared by the calendar editor swatches and the seed data so the
 * two never drift apart.
 *
 * The default is a warm amber ("yellow") rather than red. */
export const CALENDAR_COLORS = [
  "#eab308", // amber (default)
  "#0ea5c4", // cyan
  "#14b8a6", // teal
  "#22a34a", // green
  "#f97316", // orange
  "#ec4899", // pink
  "#e0483f", // red
  "#8b5cf6", // violet
] as const;

export const DEFAULT_CALENDAR_COLOR = CALENDAR_COLORS[0];
