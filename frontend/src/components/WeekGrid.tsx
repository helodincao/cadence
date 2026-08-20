import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CalEvent } from "../types";
import { useApp } from "../store/AppStore";
import {
  DAY_NAMES,
  END_HOUR,
  formatRange,
  formatTime,
  GUTTER_WIDTH,
  HOURS,
  HOUR_HEIGHT,
  hourToOffset,
  isSameDay,
  snap5,
  START_HOUR,
  toISO,
  weekdayIndex,
} from "../lib/time";
import EventBlock, { type DragMode } from "./EventBlock";
import styles from "./WeekGrid.module.css";

interface Props {
  /** The day columns to render — 7 for Week view, 1 for Day view. */
  days: Date[];
  onCreateEvent: (dateISO: string, start: number, end: number) => void;
  onEditEvent: (event: CalEvent) => void;
}

const bodyHeight = (END_HOUR - START_HOUR) * HOUR_HEIGHT;
const DRAG_THRESHOLD = 4;

interface Preview {
  id: string;
  date: string;
  start: number;
  end: number;
}

interface DragSession {
  id: string;
  mode: DragMode;
  startX: number;
  startY: number;
  grabX: number;
  grabY: number;
  width: number;
  height: number;
  bodyLeft: number;
  bodyTop: number;
  bodyWidth: number;
  origDate: string;
  origStart: number;
  origEnd: number;
  moved: boolean;
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));
const MIN_DUR = 1 / 12; // 5 minutes

interface Lane {
  lane: number;
  lanes: number;
}

/** Assign overlapping events to side-by-side columns (like Google Calendar):
 *  events that overlap in time share the width; non-overlapping ones stay full
 *  width. Returns per-event {lane index, total lanes in its overlap cluster}. */
function computeLanes(evs: CalEvent[]): Map<string, Lane> {
  const res = new Map<string, Lane>();
  const sorted = [...evs].sort((a, b) => a.start - b.start || a.end - b.end);
  let cluster: CalEvent[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    const cols: CalEvent[][] = [];
    for (const e of cluster) {
      // First column whose last event has already ended by e.start.
      const col = cols.find((c) => c[c.length - 1].end <= e.start);
      if (col) col.push(e);
      else cols.push([e]);
    }
    cols.forEach((col, ci) =>
      col.forEach((e) => res.set(e.id, { lane: ci, lanes: cols.length })),
    );
    cluster = [];
  };

  for (const e of sorted) {
    if (cluster.length && e.start >= clusterEnd) flush();
    cluster.push(e);
    clusterEnd = Math.max(clusterEnd, e.end);
  }
  flush();
  return res;
}

export default function WeekGrid({ days, onCreateEvent, onEditEvent }: Props) {
  const { calendars, events, updateEvent } = useApp();
  const today = new Date();

  const bodyRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragSession | null>(null);
  const previewRef = useRef<Preview | null>(null);
  const daysRef = useRef<Date[]>(days);
  daysRef.current = days;
  const floatingPos = useRef<{ left: number; top: number }>({ left: 0, top: 0 });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const visibleIds = new Set(
    calendars.filter((c) => c.visible).map((c) => c.id),
  );
  const visibleEvents = events.filter((e) => visibleIds.has(e.calendarId));
  const colorOf = (id: string) =>
    calendars.find((c) => c.id === id)?.color ?? "var(--ink-3)";

  const columns = `${GUTTER_WIDTH}px repeat(${days.length}, minmax(0, 1fr))`;

  const todayCol = days.findIndex((d) => isSameDay(d, today));
  const nowHour = today.getHours() + today.getMinutes() / 60;
  const showNow =
    todayCol !== -1 && nowHour >= START_HOUR && nowHour <= END_HOUR;

  function startDrag(event: CalEvent, e: React.PointerEvent, mode: DragMode) {
    e.stopPropagation();
    e.preventDefault();
    const bodyEl = bodyRef.current;
    if (!bodyEl) return;
    const bodyRect = bodyEl.getBoundingClientRect();
    const rect = e.currentTarget.getBoundingClientRect();
    dragRef.current = {
      id: event.id,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      grabX: e.clientX - rect.left,
      grabY: e.clientY - rect.top,
      width: rect.width,
      height: rect.height,
      bodyLeft: bodyRect.left,
      bodyTop: bodyRect.top,
      bodyWidth: bodyRect.width,
      origDate: event.date,
      origStart: event.start,
      origEnd: event.end,
      moved: false,
    };
    setDragActive(true);
  }

  useEffect(() => {
    if (!dragActive) return;

    function onMove(e: PointerEvent) {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      if (!d.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) d.moved = true;
      if (!d.moved) return;

      const cols = daysRef.current;
      const colWidth = (d.bodyWidth - GUTTER_WIDTH) / cols.length;
      let next: Preview;
      if (d.mode === "move") {
        const floatLeft = e.clientX - d.grabX;
        const floatTop = e.clientY - d.grabY;
        const dur = d.origEnd - d.origStart;
        const rawCol =
          colWidth > 0
            ? Math.round((floatLeft - (d.bodyLeft + GUTTER_WIDTH)) / colWidth)
            : 0;
        const col = clamp(rawCol, 0, cols.length - 1);
        const dropDate = toISO(cols[col]);
        const rawStart = START_HOUR + (floatTop - d.bodyTop) / HOUR_HEIGHT;
        const dropStart = clamp(snap5(rawStart), START_HOUR, END_HOUR - dur);
        next = { id: d.id, date: dropDate, start: dropStart, end: dropStart + dur };
        floatingPos.current = { left: floatLeft, top: floatTop };
      } else {
        const rawEnd = START_HOUR + (e.clientY - d.bodyTop) / HOUR_HEIGHT;
        const end = clamp(rawEnd, d.origStart + MIN_DUR, END_HOUR);
        next = { id: d.id, date: d.origDate, start: d.origStart, end };
      }
      previewRef.current = next;
      setPreview(next);
    }

    function onUp() {
      const d = dragRef.current;
      dragRef.current = null;
      setDragActive(false);

      const ev = d ? events.find((x) => x.id === d.id) : undefined;
      const p = previewRef.current;
      previewRef.current = null;
      setPreview(null);
      if (!d) return;

      if (!d.moved) {
        if (ev) onEditEvent(ev);
        return;
      }
      if (!ev || !p) return;

      const patch: Partial<CalEvent> =
        d.mode === "move"
          ? { date: p.date, start: p.start, end: p.end }
          : { end: clamp(snap5(p.end), d.origStart + MIN_DUR, END_HOUR) };
      if (ev.kind === "block" && ev.taskId) patch.locked = true;
      updateEvent(d.id, patch);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragActive, events, onEditEvent, updateEvent]);

  const isDragging = preview !== null && dragRef.current?.mode === "move";
  const dragMode = dragRef.current?.mode;

  const effective = (e: CalEvent): CalEvent =>
    preview && dragMode === "resize" && preview.id === e.id
      ? { ...e, end: preview.end }
      : e;

  function handleDayClick(date: Date, e: React.MouseEvent<HTMLElement>) {
    if (e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const raw = START_HOUR + (e.clientY - rect.top) / HOUR_HEIGHT;
    const start = clamp(snap5(raw), START_HOUR, END_HOUR - MIN_DUR);
    onCreateEvent(toISO(date), start, Math.min(start + 1, END_HOUR));
  }

  const floatingEvent =
    isDragging && preview ? events.find((e) => e.id === preview.id) : undefined;

  return (
    <div className={styles.wrap}>
      <div className={styles.header} style={{ gridTemplateColumns: columns }}>
        <div className={styles.corner} />
        {days.map((date, i) => {
          const w = weekdayIndex(date);
          const isToday = isSameDay(date, today);
          return (
            <div
              key={i}
              className={`${styles.dayHead} ${w >= 5 ? styles.weekend : ""}`}
            >
              <div className={styles.dow}>{DAY_NAMES[w]}</div>
              <div className={`${styles.dnum} ${isToday ? styles.today : ""}`}>
                {date.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.scroll}>
        <div
          className={styles.body}
          style={{ height: bodyHeight, gridTemplateColumns: columns }}
          ref={bodyRef}
        >
          <div className={styles.gutter}>
            {HOURS.map((h) => (
              <div key={h} className={styles.hourLabel} style={{ height: HOUR_HEIGHT }}>
                <span>{formatTime(h)}</span>
              </div>
            ))}
          </div>

          {days.map((date, i) => {
            const w = weekdayIndex(date);
            const iso = toISO(date);
            const dayEvents = visibleEvents
              .map(effective)
              .filter((e) => e.date === iso);
            const lanes = computeLanes(dayEvents);
            return (
              <div
                key={i}
                className={`${styles.dayCol} ${w >= 5 ? styles.weekendCol : ""}`}
                onClick={(e) => handleDayClick(date, e)}
              >
                {dayEvents.map((e) => {
                  const L = lanes.get(e.id);
                  return isDragging && preview && preview.id === e.id ? null : (
                    <EventBlock
                      key={e.id}
                      event={e}
                      color={colorOf(e.calendarId)}
                      lane={L?.lane ?? 0}
                      lanes={L?.lanes ?? 1}
                      dragging={dragMode === "resize" && preview?.id === e.id}
                      onDragStart={(pe, mode) => startDrag(e, pe, mode)}
                      onActivate={() => onEditEvent(e)}
                    />
                  );
                })}

                {isDragging && preview && preview.date === iso && (
                  <div
                    className={styles.placeholder}
                    style={{
                      top: (preview.start - START_HOUR) * HOUR_HEIGHT,
                      height: (preview.end - preview.start) * HOUR_HEIGHT,
                    }}
                    aria-hidden="true"
                  />
                )}
              </div>
            );
          })}

          {showNow && (
            <div
              className={styles.nowLine}
              style={{ top: hourToOffset(nowHour) }}
              aria-hidden="true"
            >
              <span className={styles.nowTime}>{formatTime(nowHour)}</span>
            </div>
          )}
        </div>
      </div>

      {isDragging &&
        floatingEvent &&
        preview &&
        createPortal(
          <div
            className={styles.floating}
            style={
              {
                left: floatingPos.current.left,
                top: floatingPos.current.top,
                width: dragRef.current?.width,
                height: dragRef.current?.height,
                "--ev-color": colorOf(floatingEvent.calendarId),
              } as React.CSSProperties
            }
          >
            <div className={styles.floatTitle}>{floatingEvent.title}</div>
            <div className={styles.floatSub}>
              {formatRange(preview.start, preview.end)}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
