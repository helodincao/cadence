import { useEffect, useRef, useState } from "react";
import styles from "./Select.module.css";

export interface Option {
  value: string;
  label: string;
}

interface Props {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  id?: string;
  ariaLabel?: string;
}

/** A HUD-themed dropdown replacing the native <select>, whose open menu is
 *  OS-styled and can't be themed with CSS. */
export default function Select({ value, options, onChange, id, ariaLabel }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = options.find((o) => o.value === value);

  return (
    <div className={styles.wrap} ref={ref}>
      <button
        type="button"
        id={id}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={styles.control}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={styles.value}>{current?.label ?? ""}</span>
        <span className={`${styles.caret} ${open ? styles.caretOpen : ""}`} aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <ul className={styles.menu} role="listbox">
          {options.map((o) => (
            <li
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              className={`${styles.option} ${o.value === value ? styles.selected : ""}`}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
