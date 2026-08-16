import { useApp } from "../store/AppStore";
import { addDays, isSameDay, startOfWeek, toISO, weekdayIndex } from "../lib/time";
import styles from "./MonthGrid.module.css";

interface Props {
  anchor: Date;
  onOpenDay: (date: Date) => void;
}

const WEEK_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_CHIPS = 3;

export default function MonthGrid({ anchor, onOpenDay }: Props) {
  const { calendars, events } = useApp();
  const today = new Date();

  const visibleIds = new Set(
    calendars.filter((c) => c.visible).map((c) => c.id),
  );
  const visibleEvents = events.filter((e) => visibleIds.has(e.calendarId));
  const colorOf = (id: string) =>
    calendars.find((c) => c.id === id)?.color ?? "var(--ink-3)";

  const month = anchor.getMonth();
  // Start on the Monday of the week containing the 1st; render 6 weeks.
  const first = new Date(anchor.getFullYear(), month, 1);
  const gridStart = startOfWeek(first);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  return (
    <div className={styles.wrap}>
      <div className={styles.weekRow}>
        {WEEK_LABELS.map((w, i) => (
          <div key={i} className={`${styles.weekLabel} ${i >= 5 ? styles.wknd : ""}`}>
            {w}
          </div>
        ))}
      </div>

      <div className={styles.grid}>
        {cells.map((date, i) => {
          const w = weekdayIndex(date);
          const iso = toISO(date);
          const inMonth = date.getMonth() === month;
          const isToday = isSameDay(date, today);
          const dayEvents = visibleEvents
            .filter((e) => e.date === iso)
            .sort((a, b) => a.start - b.start);

          return (
            <button
              key={i}
              className={`${styles.cell} ${inMonth ? "" : styles.dim} ${
                w >= 5 ? styles.wkndCell : ""
              }`}
              onClick={() => onOpenDay(date)}
            >
              <span className={`${styles.date} ${isToday ? styles.today : ""}`}>
                {date.getDate()}
              </span>
              <span className={styles.events}>
                {dayEvents.slice(0, MAX_CHIPS).map((e) => {
                  const color = colorOf(e.calendarId);
                  return (
                    <span
                      key={e.id}
                      className={styles.chip}
                      style={{
                        borderLeftColor: color,
                        color: e.kind === "block" ? color : "var(--ink)",
                      }}
                    >
                      {e.title}
                    </span>
                  );
                })}
                {dayEvents.length > MAX_CHIPS && (
                  <span className={styles.more}>
                    +{dayEvents.length - MAX_CHIPS} more
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
