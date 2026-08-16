import { useEffect, type ReactNode } from "react";
import styles from "./Modal.module.css";

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Wider dialog for content like the syllabus importer. */
  wide?: boolean;
}

/** A centered HUD dialog: dark panel, cyan frame + corner brackets,
 *  closes on backdrop click or Escape. */
export default function Modal({ title, onClose, children, wide }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        className={`${styles.panel} ${wide ? styles.wide : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.head}>
          <span className={`${styles.title} hud-label`}>{title}</span>
          <button
            className={styles.close}
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className={styles.bodyContent}>{children}</div>
      </div>
    </div>
  );
}
