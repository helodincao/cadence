import { useRef, useState } from "react";
import type { CalEvent, EventKind } from "../types";
import { useApp } from "../store/AppStore";
import { END_HOUR, START_HOUR, formatShortDate, formatTime } from "../lib/time";
import { uid } from "../lib/id";
import { importDetails, type ImportedTask } from "../lib/api";
import Modal from "./Modal";
import Select from "./Select";
import f from "./forms.module.css";
import s from "./EventImport.module.css";

interface Props {
  event: CalEvent; // full event; for new ones this is a seeded draft
  isNew: boolean;
  onClose: () => void;
}

// Half-hour marks from the first to the last grid hour.
const TIME_OPTIONS: number[] = [];
for (let h = START_HOUR; h <= END_HOUR; h += 0.5) TIME_OPTIONS.push(h);

export default function EventEditor({ event, isNew, onClose }: Props) {
  const { calendars, addEvent, updateEvent, deleteEvent, addTask, planWeek } =
    useApp();

  const [title, setTitle] = useState(event.title);
  const [calendarId, setCalendarId] = useState(
    event.calendarId || calendars[0]?.id || "",
  );
  const [date, setDate] = useState(event.date);
  const [start, setStart] = useState(event.start);
  const [end, setEnd] = useState(event.end);
  const [kind, setKind] = useState<EventKind>(event.kind);
  const [locked, setLocked] = useState(event.locked ?? false);

  // --- Optional AI panel: plan work sessions leading up to this event ---
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

  function save() {
    // Keep end after start by at least one 30-min slot.
    const safeEnd = end > start ? end : Math.min(start + 0.5, END_HOUR);
    const next: CalEvent = {
      id: event.id,
      title: title.trim() || "Untitled",
      calendarId,
      date,
      start,
      end: safeEnd,
      kind,
      locked: kind === "block" ? locked : undefined,
    };
    if (isNew) addEvent(next);
    else updateEvent(event.id, next);

    // Commit any AI-planned work sessions as tasks due on/before this event,
    // then let the scheduler place blocks for them.
    for (const t of pending) {
      addTask({
        id: uid(),
        calendarId,
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
    deleteEvent(event.id);
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
        <Select
          ariaLabel="Calendar"
          value={calendarId}
          options={calendars.map((c) => ({ value: c.id, label: c.name }))}
          onChange={setCalendarId}
        />
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

      <div className={f.row}>
        <div className={f.field}>
          <span className={f.label}>Start</span>
          <Select
            ariaLabel="Start time"
            value={String(start)}
            options={TIME_OPTIONS.map((h) => ({ value: String(h), label: formatTime(h) }))}
            onChange={(v) => setStart(Number(v))}
          />
        </div>
        <div className={f.field}>
          <span className={f.label}>End</span>
          <Select
            ariaLabel="End time"
            value={String(end)}
            options={TIME_OPTIONS.map((h) => ({ value: String(h), label: formatTime(h) }))}
            onChange={(v) => setEnd(Number(v))}
          />
        </div>
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
        <label className={f.checkbox}>
          <input
            type="checkbox"
            checked={locked}
            onChange={(e) => setLocked(e.target.checked)}
          />
          Locked (pin this block; scheduling flows around it)
        </label>
      )}

      {/* ---- Optional: plan work sessions with AI (Features B & C) ---- */}
      <div className={f.field}>
        {!aiOpen ? (
          <button
            type="button"
            className={s.aiToggle}
            onClick={() => setAiOpen(true)}
          >
            <span aria-hidden="true">✦</span>
            Plan work sessions with AI
            <span className={s.aiToggleChevron} aria-hidden="true">
              ▸
            </span>
          </button>
        ) : (
          <div className={s.aiPanel}>
            <p className={s.aiHint}>
              Describe what you want out of these sessions and attach any files.
              The AI estimates the work and allocates time before{" "}
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
                    {aiSource === "ai" ? "✦ AI" : "APPROX"}
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
                          setPending((prev) =>
                            prev.filter((_, j) => j !== i),
                          )
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
    </Modal>
  );
}
