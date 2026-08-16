import { useState } from "react";
import type { Calendar } from "../types";
import { useApp } from "../store/AppStore";
import { uid } from "../lib/id";
import Modal from "./Modal";
import f from "./forms.module.css";

interface Props {
  /** An existing calendar to edit, or null to create a new one. */
  calendar: Calendar | null;
  onClose: () => void;
}

// HUD-friendly neon presets.
const PRESETS = [
  "#35d3ff", "#4dffd2", "#7dff5e", "#ffc061",
  "#ff9e3d", "#ff6f9c", "#ff4d4d", "#b18cff",
];

export default function CalendarEditor({ calendar, onClose }: Props) {
  const { addCalendar, updateCalendar, deleteCalendar } = useApp();
  const isNew = calendar === null;

  const [name, setName] = useState(calendar?.name ?? "");
  const [color, setColor] = useState(calendar?.color ?? PRESETS[0]);

  function save() {
    const clean = name.trim() || "Untitled";
    if (isNew) {
      addCalendar({ id: uid(), name: clean, color, visible: true });
    } else {
      updateCalendar(calendar.id, { name: clean, color });
    }
    onClose();
  }

  function remove() {
    if (calendar) deleteCalendar(calendar.id);
    onClose();
  }

  return (
    <Modal title={isNew ? "New Calendar" : "Edit Calendar"} onClose={onClose}>
      <div className={f.field}>
        <label className={f.label} htmlFor="cal-name">
          Name
        </label>
        <input
          id="cal-name"
          className={f.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Research Lab"
          autoFocus
        />
      </div>

      <div className={f.field}>
        <span className={f.label}>Color</span>
        <div className={f.swatches}>
          {PRESETS.map((c) => (
            <button
              key={c}
              className={`${f.swatch} ${color === c ? f.selected : ""}`}
              style={{ background: c, color: c }}
              onClick={() => setColor(c)}
              aria-label={`Color ${c}`}
            />
          ))}
          <input
            className={f.colorInput}
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            aria-label="Custom color"
          />
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
