import { useState } from "react";
import type { CalEvent, EventKind } from "../types";
import { useApp } from "../store/AppStore";
import { END_HOUR, START_HOUR, formatTime } from "../lib/time";
import Modal from "./Modal";
import Select from "./Select";
import f from "./forms.module.css";

interface Props {
  event: CalEvent; // full event; for new ones this is a seeded draft
  isNew: boolean;
  onClose: () => void;
}

// Half-hour marks from the first to the last grid hour.
const TIME_OPTIONS: number[] = [];
for (let h = START_HOUR; h <= END_HOUR; h += 0.5) TIME_OPTIONS.push(h);

export default function EventEditor({ event, isNew, onClose }: Props) {
  const { calendars, addEvent, updateEvent, deleteEvent } = useApp();

  const [title, setTitle] = useState(event.title);
  const [calendarId, setCalendarId] = useState(
    event.calendarId || calendars[0]?.id || "",
  );
  const [date, setDate] = useState(event.date);
  const [start, setStart] = useState(event.start);
  const [end, setEnd] = useState(event.end);
  const [kind, setKind] = useState<EventKind>(event.kind);
  const [locked, setLocked] = useState(event.locked ?? false);

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
    onClose();
  }

  function remove() {
    deleteEvent(event.id);
    onClose();
  }

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
