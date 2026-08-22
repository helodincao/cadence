import { useEffect, useRef, useState } from "react";
import type { Task } from "../types";
import { useApp } from "../store/AppStore";
import { formatShortDate } from "../lib/time";
import styles from "./TaskRail.module.css";

interface Props {
  /** Show only tasks relevant to this date range (the current view period). */
  rangeStart: string; // ISO YYYY-MM-DD
  rangeEnd: string;
  /** When set, scroll to and flash this task (from a calendar due-bar click). */
  highlight?: { id: string; nonce: number } | null;
  onNewTask: () => void;
  onEditTask: (task: Task) => void;
}

const RANK = { high: 3, med: 2, low: 1 } as const;
const PRIORITY_LABEL = { high: "HIGH", med: "MED", low: "LOW" } as const;

export default function TaskRail({
  rangeStart,
  rangeEnd,
  highlight,
  onNewTask,
  onEditTask,
}: Props) {
  const { tasks, events, calendars, updateTask, planTask } = useApp();
  const railRef = useRef<HTMLElement>(null);
  const [flashId, setFlashId] = useState<string | null>(null);

  // On a due-bar click, scroll the matching card into view and flash it.
  useEffect(() => {
    if (!highlight) return;
    const el = railRef.current?.querySelector<HTMLElement>(
      `[data-task-id="${highlight.id}"]`,
    );
    if (!el) return;
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    setFlashId(highlight.id);
    const t = setTimeout(() => setFlashId(null), 1400);
    return () => clearTimeout(t);
  }, [highlight?.id, highlight?.nonce]);

  const colorOf = (id: string) =>
    calendars.find((c) => c.id === id)?.color ?? "var(--ink-3)";

  // Hours placed on the calendar for a given task.
  const scheduledFor = (taskId: string) =>
    events
      .filter((e) => e.taskId === taskId)
      .reduce((sum, e) => sum + (e.end - e.start), 0);

  // A task is "applicable" to the viewed period if it's due within it, or it
  // has any work block scheduled within it — so navigating to an empty week
  // shows an empty inbox.
  const inRange = (iso: string) => iso >= rangeStart && iso <= rangeEnd;
  const applicable = tasks.filter(
    (t) =>
      inRange(t.dueDate) ||
      events.some((e) => e.taskId === t.id && inRange(e.date)),
  );

  const ordered = [...applicable].sort(
    (a, b) =>
      Number(a.done ?? false) - Number(b.done ?? false) ||
      RANK[b.priority] - RANK[a.priority] ||
      a.dueDate.localeCompare(b.dueDate),
  );

  const openCount = applicable.filter((t) => !t.done).length;

  return (
    <aside className={styles.rail} ref={railRef}>
      <div className={styles.head}>
        <span className={`${styles.title} hud-label`}>Task Inbox</span>
        <span className={styles.count}>{openCount}</span>
        <button
          className={styles.add}
          onClick={onNewTask}
          aria-label="New task"
          title="New task"
        >
          ＋
        </button>
      </div>

      <div className={styles.list}>
        {ordered.map((task) => {
          const scheduled = scheduledFor(task.id);
          const pct = task.effortHours
            ? Math.min(100, (scheduled / task.effortHours) * 100)
            : 0;
          const shortfall = task.done ? 0 : task.effortHours - scheduled;
          const color = colorOf(task.calendarId);

          return (
            <button
              key={task.id}
              data-task-id={task.id}
              className={`${styles.task} ${task.done ? styles.done : ""} ${
                flashId === task.id ? styles.flash : ""
              }`}
              onClick={() => onEditTask(task)}
            >
              <div className={styles.taskTop}>
                <span
                  className={styles.dot}
                  style={{ background: color, boxShadow: `0 0 6px ${color}` }}
                />
                <span className={styles.taskTitle}>{task.title}</span>
              </div>

              <div className={styles.meta}>
                <span className={`${styles.chip} ${styles["pri_" + task.priority]}`}>
                  {PRIORITY_LABEL[task.priority]}
                </span>
                <span className={styles.chip}>◷ {task.effortHours}h</span>
                <span className={styles.chip}>due {formatShortDate(task.dueDate)}</span>
              </div>

              {/* scheduled-vs-effort progress */}
              <div className={styles.progressRow}>
                <div className={styles.bar}>
                  <div
                    className={styles.barFill}
                    style={{
                      width: `${pct}%`,
                      background: shortfall > 0 ? "var(--gold)" : color,
                    }}
                  />
                </div>
                <span className={styles.progressLabel}>
                  {scheduled}/{task.effortHours}h
                </span>
              </div>

              {shortfall > 0 && !task.done && (
                <div className={styles.scheduleRow}>
                  <span className={styles.warn}>{shortfall}h to schedule</span>
                  <span
                    className={styles.scheduleBtn}
                    role="button"
                    tabIndex={0}
                    aria-label={`Schedule time for ${task.title}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      planTask(task.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        planTask(task.id);
                      }
                    }}
                  >
                    ✦ Schedule time
                  </span>
                </div>
              )}

              <span
                className={styles.check}
                role="checkbox"
                aria-checked={task.done ?? false}
                aria-label={task.done ? "Mark not done" : "Mark done"}
                onClick={(e) => {
                  e.stopPropagation();
                  updateTask(task.id, { done: !task.done });
                }}
              >
                {task.done ? "✓" : ""}
              </span>
            </button>
          );
        })}

        {ordered.length === 0 && (
          <p className={styles.empty}>
            {tasks.length === 0
              ? "No tasks yet. Add one with ＋, then hit Plan Week."
              : "No tasks for this period. Navigate to a week with work due."}
          </p>
        )}
      </div>
    </aside>
  );
}
