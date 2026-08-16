import { useState } from "react";
import { useApp } from "../store/AppStore";
import { END_HOUR, START_HOUR, formatTime } from "../lib/time";
import Modal from "./Modal";
import Select from "./Select";
import f from "./forms.module.css";

const hourOpts = (hours: number[]) =>
  hours.map((h) => ({ value: String(h), label: formatTime(h) }));
const hourOpts2 = (hours: number[]) =>
  hours.map((h) => ({ value: String(h), label: `${h} h` }));

interface Props {
  onClose: () => void;
}

// Whole-hour options across the grid window (08:00 … 21:00).
const HOUR_OPTIONS: number[] = [];
for (let h = START_HOUR; h <= END_HOUR; h++) HOUR_OPTIONS.push(h);

const FOCUS_OPTIONS = [1, 1.5, 2, 3, 4];
const PER_DAY_OPTIONS = [2, 3, 4, 5, 6, 8];

export default function SettingsEditor({ onClose }: Props) {
  const { settings, updateSettings, planWeek } = useApp();

  const [workStart, setWorkStart] = useState(settings.workDayStart);
  const [workEnd, setWorkEnd] = useState(settings.workDayEnd);
  const [focus, setFocus] = useState(settings.maxFocusHours);
  const [perDay, setPerDay] = useState(settings.maxWorkHoursPerDay);
  const [weekends, setWeekends] = useState(settings.includeWeekends);
  const [breakOn, setBreakOn] = useState(settings.breakEnabled);
  const [breakStart, setBreakStart] = useState(settings.breakStart);
  const [breakEnd, setBreakEnd] = useState(settings.breakEnd);

  function save() {
    const end = workEnd > workStart ? workEnd : Math.min(workStart + 1, END_HOUR);
    const bEnd = breakEnd > breakStart ? breakEnd : breakStart + 1;
    updateSettings({
      workDayStart: workStart,
      workDayEnd: end,
      maxFocusHours: focus,
      maxWorkHoursPerDay: perDay,
      includeWeekends: weekends,
      breakEnabled: breakOn,
      breakStart,
      breakEnd: bEnd,
    });
    // Re-plan right away so the change is visible.
    planWeek();
    onClose();
  }

  return (
    <Modal title="Scheduling Preferences" onClose={onClose}>
      <div className={f.row}>
        <div className={f.field}>
          <span className={f.label}>Work from</span>
          <Select
            ariaLabel="Work from"
            value={String(workStart)}
            options={hourOpts(HOUR_OPTIONS.slice(0, -1))}
            onChange={(v) => setWorkStart(Number(v))}
          />
        </div>
        <div className={f.field}>
          <span className={f.label}>Work until</span>
          <Select
            ariaLabel="Work until"
            value={String(workEnd)}
            options={hourOpts(HOUR_OPTIONS.filter((h) => h > workStart))}
            onChange={(v) => setWorkEnd(Number(v))}
          />
        </div>
      </div>

      <div className={f.row}>
        <div className={f.field}>
          <span className={f.label}>Max focus block</span>
          <Select
            ariaLabel="Max focus block"
            value={String(focus)}
            options={hourOpts2(FOCUS_OPTIONS)}
            onChange={(v) => setFocus(Number(v))}
          />
        </div>
        <div className={f.field}>
          <span className={f.label}>Max work / day</span>
          <Select
            ariaLabel="Max work per day"
            value={String(perDay)}
            options={hourOpts2(PER_DAY_OPTIONS)}
            onChange={(v) => setPerDay(Number(v))}
          />
        </div>
      </div>

      <label className={f.checkbox} style={{ marginBottom: 14 }}>
        <input
          type="checkbox"
          checked={weekends}
          onChange={(e) => setWeekends(e.target.checked)}
        />
        Allow scheduling on weekends
      </label>

      <label className={f.checkbox} style={{ marginBottom: breakOn ? 12 : 0 }}>
        <input
          type="checkbox"
          checked={breakOn}
          onChange={(e) => setBreakOn(e.target.checked)}
        />
        Protect a daily break
      </label>

      {breakOn && (
        <div className={f.row}>
          <div className={f.field}>
            <span className={f.label}>Break from</span>
            <Select
              ariaLabel="Break from"
              value={String(breakStart)}
              options={hourOpts(HOUR_OPTIONS.slice(0, -1))}
              onChange={(v) => setBreakStart(Number(v))}
            />
          </div>
          <div className={f.field}>
            <span className={f.label}>Break until</span>
            <Select
              ariaLabel="Break until"
              value={String(breakEnd)}
              options={hourOpts(HOUR_OPTIONS.filter((h) => h > breakStart))}
              onChange={(v) => setBreakEnd(Number(v))}
            />
          </div>
        </div>
      )}

      <div className={f.actions}>
        <span className={f.spacer} />
        <button className={f.btn} onClick={onClose}>
          Cancel
        </button>
        <button className={`${f.btn} ${f.btnPrimary}`} onClick={save}>
          Save &amp; Re-plan
        </button>
      </div>
    </Modal>
  );
}
