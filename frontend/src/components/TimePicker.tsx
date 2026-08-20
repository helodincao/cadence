import Select from "./Select";
import { snap5 } from "../lib/time";
import styles from "./TimePicker.module.css";

interface Props {
  /** Time as a decimal 24h hour (13.5 === 1:30 PM). */
  value: number;
  onChange: (value: number) => void;
  ariaLabel?: string;
}

const HOURS12 = Array.from({ length: 12 }, (_, i) => i + 1); // 1..12
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5); // 0,5,…,55

function decompose(value: number): { hour12: number; minute: number; meridiem: "AM" | "PM" } {
  const v = snap5(value);
  let h24 = Math.floor(v + 1e-9);
  let minute = Math.round((v - h24) * 60);
  if (minute >= 60) {
    minute -= 60;
    h24 += 1;
  }
  const meridiem: "AM" | "PM" = h24 >= 12 ? "PM" : "AM";
  const hour12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return { hour12, minute, meridiem };
}

function compose(hour12: number, minute: number, meridiem: "AM" | "PM"): number {
  let h24 = hour12 % 12; // 12 → 0
  if (meridiem === "PM") h24 += 12;
  return h24 + minute / 60;
}

/** A HUD-themed time picker: hour / minute (5-min steps) / AM-PM dropdowns,
 *  in place of the OS-styled native <input type="time">. */
export default function TimePicker({ value, onChange, ariaLabel }: Props) {
  const { hour12, minute, meridiem } = decompose(value);
  const label = ariaLabel ? `${ariaLabel} ` : "";

  return (
    <div className={styles.picker}>
      <Select
        ariaLabel={`${label}hour`}
        value={String(hour12)}
        options={HOURS12.map((h) => ({ value: String(h), label: String(h) }))}
        onChange={(v) => onChange(compose(Number(v), minute, meridiem))}
      />
      <span className={styles.colon} aria-hidden="true">
        :
      </span>
      <Select
        ariaLabel={`${label}minute`}
        value={String(minute)}
        options={MINUTES.map((m) => ({
          value: String(m),
          label: String(m).padStart(2, "0"),
        }))}
        onChange={(v) => onChange(compose(hour12, Number(v), meridiem))}
      />
      <Select
        ariaLabel={`${label}AM or PM`}
        value={meridiem}
        options={[
          { value: "AM", label: "AM" },
          { value: "PM", label: "PM" },
        ]}
        onChange={(v) => onChange(compose(hour12, minute, v as "AM" | "PM"))}
      />
    </div>
  );
}
