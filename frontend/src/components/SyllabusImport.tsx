import { useState } from "react";
import { useApp } from "../store/AppStore";
import { uid } from "../lib/id";
import { addDays, formatShortDate, startOfDay, toISO } from "../lib/time";
import { parseSyllabus, type ParsedTask } from "../lib/api";
import Modal from "./Modal";
import Select from "./Select";
import f from "./forms.module.css";
import s from "./SyllabusImport.module.css";

interface Props {
  onClose: () => void;
}

interface Row extends ParsedTask {
  include: boolean;
}

export default function SyllabusImport({ onClose }: Props) {
  const { calendars, addTask } = useApp();

  const [text, setText] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [source, setSource] = useState<"ai" | "heuristic">("ai");
  const [calendarId, setCalendarId] = useState(calendars[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runParse() {
    setBusy(true);
    setError(null);
    try {
      const result = await parseSyllabus(text);
      setSource(result.source);
      setRows(result.tasks.map((t) => ({ ...t, include: true })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  // Fallback due date when the parser couldn't resolve one (a week out).
  const defaultDue = toISO(addDays(startOfDay(new Date()), 7));

  function addSelected() {
    if (!rows) return;
    for (const r of rows) {
      if (!r.include) continue;
      addTask({
        id: uid(),
        calendarId,
        title: r.title,
        dueDate: r.dueDate ?? defaultDue,
        effortHours: r.effortHours,
        priority: r.priority,
      });
    }
    onClose();
  }

  const selectedCount = rows?.filter((r) => r.include).length ?? 0;

  return (
    <Modal title="Import Syllabus" onClose={onClose} wide>
      {rows === null ? (
        /* ---- Step 1: paste text ---- */
        <>
          <div className={f.field}>
            <label className={f.label} htmlFor="syllabus-text">
              Paste syllabus text
            </label>
            <textarea
              id="syllabus-text"
              className={s.textarea}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                "Paste the schedule / due dates from your syllabus…\n\n" +
                "e.g. Problem Set 4 due Friday 9/19\nMidterm Exam on Oct 15"
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
              onClick={runParse}
              disabled={busy || text.trim().length < 4}
            >
              {busy ? "Parsing…" : "Parse"}
            </button>
          </div>
        </>
      ) : (
        /* ---- Step 2: review extracted tasks ---- */
        <>
          <div className={s.sourceNote}>
            {source === "ai" ? (
              <>
                <span className={s.badge}>✦ AI</span> extracted{" "}
                {rows.length} item{rows.length === 1 ? "" : "s"} — review before
                adding.
              </>
            ) : (
              <>
                <span className={`${s.badge} ${s.badgeWarn}`}>APPROX</span> no
                API key set, so this is a rough regex pass. Set{" "}
                <code>ANTHROPIC_API_KEY</code> on the backend for real parsing.
              </>
            )}
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

          <div className={s.list}>
            {rows.length === 0 && (
              <p className={s.empty}>No tasks found in that text.</p>
            )}
            {rows.map((r, i) => (
              <label key={i} className={s.row}>
                <input
                  type="checkbox"
                  checked={r.include}
                  onChange={(e) =>
                    setRows((prev) =>
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

          <div className={f.actions}>
            <button className={f.btn} onClick={() => setRows(null)}>
              Back
            </button>
            <span className={f.spacer} />
            <button className={f.btn} onClick={onClose}>
              Cancel
            </button>
            <button
              className={`${f.btn} ${f.btnPrimary}`}
              onClick={addSelected}
              disabled={selectedCount === 0}
            >
              Add {selectedCount} task{selectedCount === 1 ? "" : "s"}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
