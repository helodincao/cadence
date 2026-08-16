import { useState } from "react";
import type { Priority, Task } from "../types";
import { useApp } from "../store/AppStore";
import { uid } from "../lib/id";
import { addDays, startOfDay, toISO } from "../lib/time";
import Modal from "./Modal";
import Select from "./Select";
import f from "./forms.module.css";

interface Props {
  task: Task | null; // existing task to edit, or null to create
  onClose: () => void;
}

const PRIORITIES: Priority[] = ["low", "med", "high"];
const PRIORITY_LABEL: Record<Priority, string> = {
  low: "Low",
  med: "Med",
  high: "High",
};

export default function TaskEditor({ task, onClose }: Props) {
  const { calendars, addTask, updateTask, deleteTask } = useApp();
  const isNew = task === null;

  const [title, setTitle] = useState(task?.title ?? "");
  const [calendarId, setCalendarId] = useState(
    task?.calendarId ?? calendars[0]?.id ?? "",
  );
  const [dueDate, setDueDate] = useState(
    task?.dueDate ?? toISO(addDays(startOfDay(new Date()), 7)),
  );
  const [effortHours, setEffortHours] = useState(task?.effortHours ?? 2);
  const [priority, setPriority] = useState<Priority>(task?.priority ?? "med");

  function save() {
    const next: Task = {
      id: task?.id ?? uid(),
      title: title.trim() || "Untitled task",
      calendarId,
      dueDate,
      effortHours: Math.max(0.5, effortHours || 0),
      priority,
      done: task?.done,
    };
    if (isNew) addTask(next);
    else updateTask(task.id, next);
    onClose();
  }

  function remove() {
    if (task) deleteTask(task.id);
    onClose();
  }

  return (
    <Modal title={isNew ? "New Task" : "Edit Task"} onClose={onClose}>
      <div className={f.field}>
        <label className={f.label} htmlFor="task-title">
          Title
        </label>
        <input
          id="task-title"
          className={f.input}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Finish problem set"
          autoFocus
        />
      </div>

      <div className={f.field}>
        <span className={f.label}>Calendar</span>
        <Select
          ariaLabel="Calendar"
          value={calendarId}
          options={calendars.map((c) => ({ value: c.id, label: c.name }))}
          onChange={setCalendarId}
        />
      </div>

      <div className={f.row}>
        <div className={f.field}>
          <label className={f.label} htmlFor="task-due">
            Due
          </label>
          <input
            id="task-due"
            className={f.dateInput}
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
        <div className={f.field}>
          <label className={f.label} htmlFor="task-effort">
            Effort (hours)
          </label>
          <input
            id="task-effort"
            className={f.input}
            type="number"
            min={0.5}
            step={0.5}
            value={effortHours}
            onChange={(e) => setEffortHours(Number(e.target.value))}
          />
        </div>
      </div>

      <div className={f.field}>
        <span className={f.label}>Priority</span>
        <div className={f.segment}>
          {PRIORITIES.map((p) => (
            <button
              key={p}
              className={priority === p ? f.on : ""}
              onClick={() => setPriority(p)}
            >
              {PRIORITY_LABEL[p]}
            </button>
          ))}
        </div>
      </div>

      <div className={f.actions}>
        {!isNew && (
          <button className={`${f.btn} ${f.btnDanger}`} onClick={remove}>
            Delete
          </button>
        )}
        <span className={f.spacer} />
        <button className={f.btn} onClick={onClose}>
          Cancel
        </button>
        <button className={`${f.btn} ${f.btnPrimary}`} onClick={save}>
          {isNew ? "Create" : "Save"}
        </button>
      </div>
    </Modal>
  );
}
