import type { Task } from "../types";
import { useApp } from "../store/AppStore";
import { formatShortDate } from "../lib/time";
import styles from "./TaskRail.module.css";

interface Props {
  onNewTask: () => void;
  onEditTask: (task: Task) => void;
}

const RANK = { high: 3, med: 2, low: 1 } as const;
const PRIORITY_LABEL = { high: "HIGH", med: "MED", low: "LOW" } as const;

export default function TaskRail({ onNewTask, onEditTask }: Props) {
  const { tasks, events, calendars, updateTask } = useApp();

  const colorOf = (id: string) =>
    calendars.find((c) => c.id === id)?.color ?? "var(--ink-3)";

  // Hours placed on the calendar for a given task.
  const scheduledFor = (taskId: string) =>
    events
      .filter((e) => e.taskId === taskId)
      .reduce((sum, e) => sum + (e.end - e.start), 0);

  const ordered = [...tasks].sort(
    (a, b) =>
      Number(a.done ?? false) - Number(b.done ?? false) ||
      RANK[b.priority] - RANK[a.priority] ||
      a.dueDate.localeCompare(b.dueDate),
  );

  const openCount = tasks.filter((t) => !t.done).length;

  return (
    <aside className={styles.rail}>
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
              className={`${styles.task} ${task.done ? styles.done : ""}`}
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

              {shortfall > 0 && (
                <div className={styles.warn}>
                  {shortfall}h unscheduled — try Plan Week
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

        {tasks.length === 0 && (
          <p className={styles.empty}>
            No tasks yet. Add one with ＋, then hit Plan Week.
          </p>
        )}
      </div>
    </aside>
  );
}
