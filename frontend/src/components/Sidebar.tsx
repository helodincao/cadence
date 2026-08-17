import { useEffect, useState } from "react";
import type { Calendar } from "../types";
import { useApp } from "../store/AppStore";
import { isSameDay } from "../lib/time";
import styles from "./Sidebar.module.css";

interface Props {
  anchor: Date;
  onSelectDate: (date: Date) => void;
  onNewCalendar: () => void;
  onEditCalendar: (calendar: Calendar) => void;
  onNewEvent: () => void;
  onOpenSettings: () => void;
  onImport: () => void;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function monthCells(view: Date): (number | null)[] {
  const year = view.getFullYear();
  const month = view.getMonth();
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default function Sidebar({
  anchor,
  onSelectDate,
  onNewCalendar,
  onEditCalendar,
  onNewEvent,
  onOpenSettings,
  onImport,
}: Props) {
  const { calendars, toggleCalendar, resetAll } = useApp();
  const today = new Date();

  // The mini-month can browse independently, but follows the main view.
  const [viewMonth, setViewMonth] = useState(
    () => new Date(anchor.getFullYear(), anchor.getMonth(), 1),
  );
  useEffect(() => {
    setViewMonth(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
  }, [anchor]);

  const cells = monthCells(viewMonth);
  const shiftMonth = (delta: number) =>
    setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));

  return (
    <aside className={styles.sidebar}>
      {/* Mini month */}
      <div className={styles.mini}>
        <div className={styles.miniHead}>
          <button
            className={styles.miniNav}
            onClick={() => shiftMonth(-1)}
            aria-label="Previous month"
          >
            ‹
          </button>
          <span className={styles.miniTitle}>
            {MONTHS[viewMonth.getMonth()]} {viewMonth.getFullYear()}
          </span>
          <button
            className={styles.miniNav}
            onClick={() => shiftMonth(1)}
            aria-label="Next month"
          >
            ›
          </button>
        </div>
        <div className={styles.miniGrid}>
          {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
            <span key={i} className={styles.wk}>
              {d}
            </span>
          ))}
          {cells.map((day, i) => {
            if (day == null) return <span key={i} />;
            const date = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day);
            const isToday = isSameDay(date, today);
            const isSelected = isSameDay(date, anchor);
            return (
              <button
                key={i}
                className={`${styles.miniDay} ${isToday ? styles.todayCell : ""} ${
                  isSelected && !isToday ? styles.selectedCell : ""
                }`}
                onClick={() => onSelectDate(date)}
              >
                {day}
              </button>
            );
          })}
        </div>
      </div>

      {/* Calendar list */}
      <div className={styles.label}>
        My calendars
        <button className={styles.addCal} onClick={onNewCalendar} aria-label="New calendar">
          ＋
        </button>
      </div>
      <div className={styles.calList}>
        {calendars.map((cal) => (
          <div key={cal.id} className={`${styles.cal} ${cal.visible ? "" : styles.dim}`}>
            <button
              className={styles.calToggle}
              onClick={() => toggleCalendar(cal.id)}
              aria-pressed={cal.visible}
              aria-label={cal.visible ? `Hide ${cal.name}` : `Show ${cal.name}`}
            >
              <span
                className={styles.swatch}
                style={
                  cal.visible
                    ? { background: cal.color, boxShadow: `0 0 8px ${cal.color}aa` }
                    : { borderColor: "var(--ink-3)" }
                }
              >
                {cal.visible && (
                  <svg viewBox="0 0 10 10" aria-hidden="true">
                    <path
                      d="M1 5l2.5 2.5L9 1.5"
                      stroke="#04070d"
                      strokeWidth="1.8"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </span>
              <span className={styles.calName}>{cal.name}</span>
            </button>
            <button
              className={styles.calEdit}
              onClick={() => onEditCalendar(cal)}
              aria-label={`Edit ${cal.name}`}
            >
              ✎
            </button>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className={styles.actions}>
        <button className={styles.action} onClick={onNewEvent}>
          <span aria-hidden="true">＋</span> <b>New event</b>
        </button>
        <button className={styles.action} onClick={onOpenSettings}>
          <span aria-hidden="true">⚙</span> <b>Preferences</b>
        </button>
        <button className={styles.action} onClick={onImport}>
          <span aria-hidden="true">✦</span> <b>Import Event Details</b>
        </button>
      </div>

      <button className={styles.reset} onClick={resetAll}>
        Reset demo data
      </button>
    </aside>
  );
}
