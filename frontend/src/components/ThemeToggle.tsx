import { useState } from "react";
import styles from "./ThemeToggle.module.css";

type Theme = "dark" | "light";

const STORAGE_KEY = "cadence.theme";

function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

/** Switches the app between the dark (default) and light themes by toggling
 *  <html data-theme>, and remembers the choice in localStorage. The initial
 *  value is applied before render by a small script in index.html. */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(currentTheme);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* private mode — the toggle still works for this session */
    }
    setTheme(next);
  }

  const goingTo = theme === "dark" ? "light" : "dark";
  return (
    <button
      className={styles.toggle}
      onClick={toggle}
      aria-label={`Switch to ${goingTo} mode`}
      title={`Switch to ${goingTo} mode`}
    >
      <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
    </button>
  );
}
