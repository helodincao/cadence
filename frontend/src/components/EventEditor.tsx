import { useRef, useState } from "react";
import type { CalEvent, EventKind } from "../types";
import { useApp } from "../store/AppStore";
import { END_HOUR, formatShortDate, snap5 } from "../lib/time";
import { uid } from "../lib/id";
import { DEFAULT_CALENDAR_COLOR } from "../lib/palette";
import { importDetails, type ImportedTask } from "../lib/api";
import Modal from "./Modal";
import Select from "./Select";
import TimePicker from "./TimePicker";
import f from "./forms.module.css";
import s from "./EventImport.module.css";

interface Props {
  event: CalEvent; // full event; for new ones this is a seeded draft
  isNew: boolean;
  onClose: () => void;
}

export default function EventEditor({ event, isNew, onClose }: Props) {
  const {
    calendars,
    tasks,
    events,
    addCalendar,
    addEvent,
    updateEvent,
    deleteEvent,
    deleteEvents,
    addTask,
    planWeek,
  } = useApp();

  const [title, setTitle] = useState(event.title);
  const [calendarId, setCalendarId] = useState(
    event.calendarId || calendars[0]?.id || "",
  );
  const [date, setDate] = useState(event.date);
  const [start, setStart] = useState(event.start);
  const [end, setEnd] = useState(event.end);
  const [kind, setKind] = useState<EventKind>(event.kind);
  const [locked, setLocked] = useState(event.locked ?? false);
  const [taskId, setTaskId] = useState(event.taskId ?? "");

  // Inline "add a calendar" from within the picker.
  const [addingCal, setAddingCal] = useState(false);
  const [newCalName, setNewCalName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Other events that are "the same" as this one (a repeated/recurring series):
  // same title, time, and calendar. Used to offer "delete all like this".
  const norm = (t: string) => t.trim().toLowerCase();
  const sameSeries = events.filter(
    (e) =>
      norm(e.title) === norm(event.title) &&
      e.start === event.start &&
      e.end === event.end &&
      e.calendarId === event.calendarId,
  );
  const dupCount = sameSeries.length;

  // --- Optional Cadence panel: plan work sessions leading up to this event ---
  const aiFileRef = useRef<HTMLInputElement>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiGoal, setAiGoal] = useState("");
  const [aiFiles, setAiFiles] = useState<File[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiNote, setAiNote] = useState("");
  const [aiSource, setAiSource] = useState<"ai" | "heuristic">("ai");
  const [pending, setPending] = useState<ImportedTask[]>([]);

  // A work session's deadline is this event's date; never after it.
  const dueFor = (t: ImportedTask) =>
    t.dueDate && t.dueDate <= date ? t.dueDate : date;

  function addAiFiles(list: FileList | null) {
    if (!list) return;
    setAiFiles((prev) => [...prev, ...Array.from(list)]);
    if (aiFileRef.current) aiFileRef.current.value = "";
  }

  async function generate() {
    setAiBusy(true);
    setAiError(null);
    try {
      const result = await importDetails(aiGoal, aiFiles, date);
      setAiNote(result.note);
      setAiSource(result.source);
      setPending((prev) => [...prev, ...result.tasks]);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setAiBusy(false);
    }
  }

  function createCalendar() {
    const id = uid();
    addCalendar({
      id,
      name: newCalName.trim() || "New Calendar",
      color: DEFAULT_CALENDAR_COLOR,
      visible: true,
    });
    setCalendarId(id);
    setNewCalName("");
    setAddingCal(false);
  }

  function save() {
    // Keep end after start by at least one 5-min slot.
    const safeEnd = end > start ? end : Math.min(start + 1 / 12, END_HOUR);

    // No calendar chosen (e.g. a first-ever one-off event) — quietly create a
    // default one so the event has a home, without making the user do it first.
    let calId = calendarId;
    if (!calId) {
      calId = uid();
      addCalendar({
        id: calId,
        name: "My Calendar",
        color: DEFAULT_CALENDAR_COLOR,
        visible: true,
      });
    }

    const linkedTask = kind === "block" && taskId ? taskId : undefined;
    const next: CalEvent = {
      id: event.id,
      title: title.trim() || "Untitled",
      calendarId: calId,
      date,
      start: snap5(start),
      end: snap5(safeEnd),
      kind,
      // A manual work block tied to a task is pinned so Plan Week keeps it.
      locked: kind === "block" ? locked || !!linkedTask : undefined,
      taskId: linkedTask,
    };
    if (isNew) addEvent(next);
    else updateEvent(event.id, next);

    // Commit any Cadence-planned work sessions as tasks due on/before this
    // event, then let the scheduler place blocks for them.
    for (const t of pending) {
      addTask({
        id: uid(),
        calendarId: calId,
        title: t.title,
        dueDate: dueFor(t),
        effortHours: t.effortHours,
        priority: t.priority,
      });
    }
    if (pending.length > 0) planWeek();
    onClose();
  }

  function remove() {
    // If this event is one of several identical ones, ask which to delete.
    if (dupCount > 1) {
      setConfirmDelete(true);
      return;
    }
    deleteEvent(event.id);
    onClose();
  }

  function deleteJustThis() {
    deleteEvent(event.id);
    onClose();
  }

  function deleteAllMatching() {
    deleteEvents(sameSeries.map((e) => e.id));
    onClose();
  }

  const primaryLabel =
    pending.length > 0
      ? isNew
        ? "Create & plan"
        : "Save & plan"
      : isNew
        ? "Create"
        : "Save";

  return (
    <Modal title={isNew ? "New Event" : "Edit Event"} onClose={onClose}>
      <div className={f.field}>
        <label className={f.label} htmlFor="ev-title">
          Title
        </label>
        <input
          id="ev-title"
          className={f.input}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Study block"
          autoFocus
        />
      </div>

      <div className={f.field}>
        <span className={f.label}>Calendar</span>
        {calendars.length > 0 ? (
          <Select
            ariaLabel="Calendar"
            value={calendarId}
            options={calendars.map((c) => ({ value: c.id, label: c.name }))}
            onChange={setCalendarId}
          />
        ) : (
          <div className={f.emptyNote}>No calendars available</div>
        )}
        {addingCal ? (
          <div className={f.inlineAdd}>
            <input
              className={f.input}
              value={newCalName}
              placeholder="New calendar name"
              autoFocus
              onChange={(e) => setNewCalName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createCalendar()}
            />
            <button
              type="button"
              className={`${f.btn} ${f.btnPrimary}`}
              onClick={createCalendar}
            >
              Add
            </button>
            <button
              type="button"
              className={f.btn}
              onClick={() => {
                setAddingCal(false);
                setNewCalName("");
              }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            className={f.linkBtn}
            onClick={() => setAddingCal(true)}
          >
            ＋ New calendar
          </button>
        )}
      </div>

      <div className={f.field}>
        <label className={f.label} htmlFor="ev-date">
          Date
        </label>
        <input
          id="ev-date"
          className={f.dateInput}
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      <div className={f.field}>
        <span className={f.label}>Start</span>
        <TimePicker ariaLabel="Start" value={start} onChange={setStart} />
      </div>
      <div className={f.field}>
        <span className={f.label}>End</span>
        <TimePicker ariaLabel="End" value={end} onChange={setEnd} />
      </div>

      <div className={f.field}>
        <span className={f.label}>Type</span>
        <div className={f.segment}>
          <button
            className={kind === "fixed" ? f.on : ""}
            onClick={() => setKind("fixed")}
          >
            Fixed
          </button>
          <button
            className={kind === "block" ? f.on : ""}
            onClick={() => setKind("block")}
          >
            Work block
          </button>
        </div>
      </div>

      {kind === "block" && (
        <>
          <label className={f.checkbox}>
            <input
              type="checkbox"
              checked={locked}
              onChange={(e) => setLocked(e.target.checked)}
            />
            Locked (pin this block; scheduling flows around it)
          </label>

          {tasks.length > 0 && (
            <div className={f.field}>
              <span className={f.label}>Dedicate to task (optional)</span>
              <Select
                ariaLabel="Dedicate to task"
                value={taskId}
                options={[
                  { value: "", label: "— None —" },
                  ...tasks.map((t) => ({ value: t.id, label: t.title })),
                ]}
                onChange={setTaskId}
              />
            </div>
          )}
        </>
      )}

      {/* ---- Optional: plan work sessions with Cadence ---- */}
      <div className={f.field}>
        {!aiOpen ? (
          <button
            type="button"
            className={s.aiToggle}
            onClick={() => setAiOpen(true)}
          >
            <span aria-hidden="true">✦</span>
            Plan work sessions with Cadence
            <span className={s.aiToggleChevron} aria-hidden="true">
              ▸
            </span>
          </button>
        ) : (
          <div className={s.aiPanel}>
            <p className={s.aiHint}>
              Describe what you want out of these sessions and attach any files.
              Cadence estimates the work and allocates time before{" "}
              {formatShortDate(date)}.
            </p>

            <div className={f.field}>
              <span className={f.label}>Files (optional)</span>
              <input
                ref={aiFileRef}
                id="ai-files"
                type="file"
                multiple
                className={s.hiddenInput}
                onChange={(e) => addAiFiles(e.target.files)}
              />
              <label htmlFor="ai-files" className={s.dropzone}>
                ＋ Add assignment / spec files — PDF, image, or text
              </label>
              {aiFiles.length > 0 && (
                <div className={s.fileChips}>
                  {aiFiles.map((file, i) => (
                    <span key={i} className={s.fileChip}>
                      {file.name}
                      <button
                        className={s.fileRemove}
                        onClick={() =>
                          setAiFiles((prev) => prev.filter((_, j) => j !== i))
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
              <label className={f.label} htmlFor="ai-goal">
                Your goal for these sessions
              </label>
              <textarea
                id="ai-goal"
                className={s.textarea}
                value={aiGoal}
                onChange={(e) => setAiGoal(e.target.value)}
                placeholder={
                  "e.g. Finish a working draft, then rehearse twice before the presentation."
                }
              />
            </div>

            {aiError && <div className={s.error}>{aiError}</div>}

            <div className={f.actions}>
              <span className={f.spacer} />
              <button className={f.btn} onClick={() => setAiOpen(false)}>
                Close
              </button>
              <button
                className={`${f.btn} ${f.btnPrimary}`}
                onClick={generate}
                disabled={
                  aiBusy || (aiGoal.trim().length < 3 && aiFiles.length === 0)
                }
              >
                {aiBusy ? "Planning…" : "Generate work sessions"}
              </button>
            </div>

            {pending.length > 0 && (
              <>
                <div className={s.sourceNote} style={{ marginTop: 14 }}>
                  <span
                    className={`${s.badge} ${aiSource === "ai" ? "" : s.badgeWarn}`}
                  >
                    {aiSource === "ai" ? "✦ Cadence" : "APPROX"}
                  </span>
                  {aiNote}
                </div>
                <div className={s.sectionLabel}>Work sessions to add</div>
                <div className={s.list}>
                  {pending.map((r, i) => (
                    <div key={i} className={s.row}>
                      <span className={s.rowMain}>
                        <span className={s.rowTitle}>{r.title}</span>
                        <span className={s.chips}>
                          <span
                            className={`${s.chip} ${s["pri_" + r.priority]}`}
                          >
                            {r.priority.toUpperCase()}
                          </span>
                          <span className={s.chip}>◷ {r.effortHours}h</span>
                          <span className={s.chip}>
                            due {formatShortDate(dueFor(r))}
                          </span>
                        </span>
                      </span>
                      <button
                        className={s.fileRemove}
                        onClick={() =>
                          setPending((prev) => prev.filter((_, j) => j !== i))
                        }
                        aria-label={`Remove ${r.title}`}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {confirmDelete ? (
        <div className={f.actions}>
          <span className={f.confirmText}>
            {dupCount} events named “{event.title.trim() || "Untitled"}”.
          </span>
          <span className={f.spacer} />
          <button className={f.btn} onClick={() => setConfirmDelete(false)}>
            Cancel
          </button>
          <button className={`${f.btn} ${f.btnDanger}`} onClick={deleteJustThis}>
            Just this one
          </button>
          <button className={`${f.btn} ${f.btnDanger}`} onClick={deleteAllMatching}>
            All {dupCount}
          </button>
        </div>
      ) : (
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
            {primaryLabel}
          </button>
        </div>
      )}
    </Modal>
  );
}
