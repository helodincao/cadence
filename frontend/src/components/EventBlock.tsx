import type { CalEvent } from "../types";
import { formatRange, HOUR_HEIGHT, hourToOffset } from "../lib/time";
import styles from "./EventBlock.module.css";

export type DragMode = "move" | "resize";

interface Props {
  event: CalEvent;
  color: string;
  /** Which overlap column this block sits in, and how many columns total. */
  lane?: number;
  lanes?: number;
  /** Begin a move (body) or resize (bottom handle) gesture. */
  onDragStart: (e: React.PointerEvent, mode: DragMode) => void;
  /** Keyboard activation (Enter/Space) opens the editor. */
  onActivate: () => void;
  /** True while this block is the one being dragged/resized. */
  dragging?: boolean;
}

export default function EventBlock({
  event,
  color,
  lane = 0,
  lanes = 1,
  onDragStart,
  onActivate,
  dragging,
}: Props) {
  const top = hourToOffset(event.start);
  const height = (event.end - event.start) * HOUR_HEIGHT;
  const isBlock = event.kind === "block";

  // Overlapping events share the column width as side-by-side lanes, with a
  // small gutter between them and against the day edges.
  const laneWidth = 100 / lanes;
  const style = {
    top,
    height,
    left: `calc(${lane * laneWidth}% + 2px)`,
    width: `calc(${laneWidth}% - 4px)`,
    "--ev-color": color,
  } as React.CSSProperties;

  const className = [
    styles.event,
    isBlock ? styles.block : styles.fixed,
    event.locked ? styles.locked : "",
    dragging ? styles.dragging : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={className}
      style={style}
      role="button"
      tabIndex={0}
      aria-label={`${event.title}, ${formatRange(event.start, event.end)}`}
      onPointerDown={(e) => onDragStart(e, "move")}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onActivate();
        }
      }}
    >
      <div className={styles.title}>{event.title}</div>
      <div className={styles.sub}>
        {formatRange(event.start, event.end)}
        {isBlock && (
          <span className={styles.tag}>{event.locked ? "◆ LCK" : "◈ AI"}</span>
        )}
      </div>

      {/* bottom edge = resize handle */}
      <div
        className={styles.resize}
        onPointerDown={(e) => {
          e.stopPropagation();
          onDragStart(e, "resize");
        }}
        aria-hidden="true"
      />
    </div>
  );
}
