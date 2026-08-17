import { useRef, useState } from "react";
import { useApp } from "../store/AppStore";
import { uid } from "../lib/id";
import {
  addDays,
  formatRange,
  formatShortDate,
  startOfDay,
  toISO,
} from "../lib/time";
import {
  importDetails,
  type ImportedEvent,
  type ImportedTask,
} from "../lib/api";
import Modal from "./Modal";
import Select from "./Select";
import f from "./forms.module.css";
import s from "./EventImport.module.css";

interface Props {
  onClose: () => void;
}

interface TaskRow extends ImportedTask {
  include: boolean;
}
interface EventRow extends ImportedEvent {
  include: boolean;
}

export default function EventImport({ onClose }: Props) {
  const { calendars, addTask, addEvent, planWeek } = useApp();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [prompt, setPrompt] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [taskRows, setTaskRows] = useState<TaskRow[] | null>(null);
  const [eventRows, setEventRows] = useState<EventRow[]>([]);
  const [note, setNote] = useState("");
  const [source, setSource] = useState<"ai" | "heuristic">("ai");
  const [calendarId, setCalendarId] = useState(calendars[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const defaultDue = toISO(addDays(startOfDay(new Date()), 7));

  function addFiles(list: FileList | null) {
    if (!list) return;
    setFiles((prev) => [...prev, ...Array.from(list)]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const result = await importDetails(prompt, files);
      setNote(result.note);
      setSource(result.source);
      setTaskRows(result.tasks.map((t) => ({ ...t, include: true })));
      setEventRows(result.events.map((e) => ({ ...e, include: true })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  function addAll() {
    if (!taskRows) return;
    for (const t of taskRows) {
      if (!t.include) continue;
      addTask({
        id: uid(),
        calendarId,
        title: t.title,
        dueDate: t.dueDate ?? defaultDue,
        effortHours: t.effortHours,
        priority: t.priority,
      });
    }
    for (const e of eventRows) {
      if (!e.include) continue;
      addEvent({
        id: uid(),
        calendarId,
        title: e.title,
        date: e.date,
        start: e.start,
        end: e.end,
        kind: "fixed",
      });
    }
    planWeek(); // allocate work time for the new tasks right away
    onClose();
  }

  const selectedTasks = taskRows?.filter((r) => r.include).length ?? 0;
  const selectedEvents = eventRows.filter((r) => r.include).length;
  const totalSelected = selectedTasks + selectedEvents;

  return (
    <Modal title="Import Event Details" onClose={onClose} wide>
      {taskRows === null ? (
        /* ---- Step 1: files + instruction ---- */
        <>
          <div className={f.field}>
            <span className={f.label}>Files (optional)</span>
            <input
              ref={fileInputRef}
              id="import-files"
              type="file"
              multiple
              className={s.hiddenInput}
              onChange={(e) => addFiles(e.target.files)}
            />
            <label htmlFor="import-files" className={s.dropzone}>
              ＋ Add syllabus / spec files — PDF, image, or text
            </label>
            {files.length > 0 && (
              <div className={s.fileChips}>
                {files.map((file, i) => (
                  <span key={i} className={s.fileChip}>
                    {file.name}
                    <button
                      className={s.fileRemove}
                      onClick={() =>
                        setFiles((prev) => prev.filter((_, j) => j !== i))
                      }
                      aria-label={`Remove ${file.name}`}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className={f.field}>
            <label className={f.label} htmlFor="import-prompt">
              What should I schedule?
            </label>
            <textarea
              id="import-prompt"
              className={s.textarea}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={
                "Tell the AI what to do, e.g.\n\n" +
                "• This project is due next Friday — based on its complexity, schedule time to work on it.\n" +
                "• This is my class syllabus — schedule all the assignment due dates and exams."
              }
              autoFocus
            />
          </div>

          {error && <div className={s.error}>{error}</div>}

          <div className={f.actions}>
            <span className={f.spacer} />
            <button className={f.btn} onClick={onClose}>
              Cancel
            </button>
            <button
              className={`${f.btn} ${f.btnPrimary}`}
              onClick={run}
              disabled={busy || (prompt.trim().length < 3 && files.length === 0)}
            >
              {busy ? "Planning…" : "Generate plan"}
            </button>
          </div>
        </>
      ) : (
        /* ---- Step 2: review ---- */
        <>
          <div className={s.sourceNote}>
            <span className={`${s.badge} ${source === "ai" ? "" : s.badgeWarn}`}>
              {source === "ai" ? "✦ AI" : "APPROX"}
            </span>
            {note}
          </div>

          <div className={f.field}>
            <span className={f.label}>Add to calendar</span>
            <Select
              ariaLabel="Add to calendar"
              value={calendarId}
              options={calendars.map((c) => ({ value: c.id, label: c.name }))}
              onChange={setCalendarId}
            />
          </div>

          {taskRows.length > 0 && (
            <>
              <div className={s.sectionLabel}>Tasks (work to schedule)</div>
              <div className={s.list}>
                {taskRows.map((r, i) => (
                  <label key={i} className={s.row}>
                    <input
                      type="checkbox"
                      checked={r.include}
                      onChange={(e) =>
                        setTaskRows((prev) =>
                          prev!.map((x, j) =>
                            j === i ? { ...x, include: e.target.checked } : x,
                          ),
                        )
                      }
                    />
                    <span className={s.rowMain}>
                      <span className={s.rowTitle}>{r.title}</span>
                      <span className={s.chips}>
                        <span className={`${s.chip} ${s["pri_" + r.priority]}`}>
                          {r.priority.toUpperCase()}
                        </span>
                        <span className={s.chip}>◷ {r.effortHours}h</span>
                        <span className={s.chip}>
                          {r.dueDate ? `due ${formatShortDate(r.dueDate)}` : "no date"}
                        </span>
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </>
          )}

          {eventRows.length > 0 && (
            <>
              <div className={s.sectionLabel}>Events (fixed times)</div>
              <div className={s.list}>
                {eventRows.map((r, i) => (
                  <label key={i} className={s.row}>
                    <input
                      type="checkbox"
                      checked={r.include}
                      onChange={(e) =>
                        setEventRows((prev) =>
                          prev.map((x, j) =>
                            j === i ? { ...x, include: e.target.checked } : x,
                          ),
                        )
                      }
                    />
                    <span className={s.rowMain}>
                      <span className={s.rowTitle}>{r.title}</span>
                      <span className={s.chips}>
                        <span className={s.chip}>{formatShortDate(r.date)}</span>
                        <span className={s.chip}>{formatRange(r.start, r.end)}</span>
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </>
          )}

          {taskRows.length === 0 && eventRows.length === 0 && (
            <p className={s.empty}>Nothing to schedule was found. Try adding more detail.</p>
          )}

          <div className={f.actions}>
            <button
              className={f.btn}
              onClick={() => {
                setTaskRows(null);
                setEventRows([]);
              }}
            >
              Back
            </button>
            <span className={f.spacer} />
            <button className={f.btn} onClick={onClose}>
              Cancel
            </button>
            <button
              className={`${f.btn} ${f.btnPrimary}`}
              onClick={addAll}
              disabled={totalSelected === 0}
            >
              Add {totalSelected} &amp; plan
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
