import { addDays, DAY_NAMES, weekdayIndex } from "../lib/time";
import styles from "./TopBar.module.css";

export type View = "day" | "week" | "month";

interface Props {
  view: View;
  anchor: Date;
  weekStart: Date;
  onView: (view: View) => void;
  onToday: () => void;
  onPrev: () => void;
  onNext: () => void;
  onPlan: () => void;
}

const MON = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];
const MONTH_FULL = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function label(view: View, anchor: Date, weekStart: Date): string {
  if (view === "month") {
    return `${MONTH_FULL[anchor.getMonth()]} ${anchor.getFullYear()}`;
  }
  if (view === "day") {
    return `${DAY_NAMES[weekdayIndex(anchor)]} · ${MON[anchor.getMonth()]} ${pad(anchor.getDate())}`;
  }
  const end = addDays(weekStart, 6);
  const left = `${MON[weekStart.getMonth()]} ${pad(weekStart.getDate())}`;
  const right =
    weekStart.getMonth() === end.getMonth()
      ? pad(end.getDate())
      : `${MON[end.getMonth()]} ${pad(end.getDate())}`;
  return `${left} – ${right}`;
}

function Reactor() {
  return (
    <svg className={styles.reactor} viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="18" className={styles.ring} />
      <circle cx="20" cy="20" r="13" className={styles.ringSoft} />
      <g className={styles.spokes}>
        {Array.from({ length: 8 }).map((_, i) => (
          <line key={i} x1="20" y1="20" x2="20" y2="3" transform={`rotate(${i * 45} 20 20)`} />
        ))}
      </g>
      <polygon points="20,11 27.8,24.5 12.2,24.5" className={styles.core} />
      <circle cx="20" cy="20" r="3.4" className={styles.coreDot} />
    </svg>
  );
}

export default function TopBar({
  view,
  anchor,
  weekStart,
  onView,
  onToday,
  onPrev,
  onNext,
  onPlan,
}: Props) {
  return (
    <header className={styles.topbar}>
      <div className={styles.brand}>
        <Reactor />
        <span className={styles.brandName}>CADENCE</span>
      </div>

      <div className={styles.nav}>
        <button className={`${styles.today} hud-label`} onClick={onToday}>
          Today
        </button>
        <button className={styles.chev} aria-label="Previous" onClick={onPrev}>
          ‹
        </button>
        <button className={styles.chev} aria-label="Next" onClick={onNext}>
          ›
        </button>
      </div>

      <div className={styles.week}>
        <span className={`${styles.weekTag} hud-label`}>
          {view === "month" ? "MO //" : view === "day" ? "DAY //" : "WK //"}
        </span>
        <span className={styles.weekLabel}>{label(view, anchor, weekStart)}</span>
      </div>

      <span className={styles.spacer} />

      <div className={`${styles.segment} hud-label`} role="group" aria-label="Calendar view">
        {(["day", "week", "month"] as View[]).map((v) => (
          <button
            key={v}
            className={view === v ? styles.on : ""}
            aria-current={view === v}
            onClick={() => onView(v)}
          >
            {v}
          </button>
        ))}
      </div>

      <button className={`${styles.plan} hud-label`} onClick={onPlan}>
        <span aria-hidden="true">◈</span> Plan Week
      </button>
    </header>
  );
}
