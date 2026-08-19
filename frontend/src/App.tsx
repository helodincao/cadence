import { useEffect, useMemo, useState } from "react";
import TopBar, { type View } from "./components/TopBar";
import Sidebar from "./components/Sidebar";
import WeekGrid from "./components/WeekGrid";
import MonthGrid from "./components/MonthGrid";
import TaskRail from "./components/TaskRail";
import CalendarEditor from "./components/CalendarEditor";
import EventEditor from "./components/EventEditor";
import TaskEditor from "./components/TaskEditor";
import SettingsEditor from "./components/SettingsEditor";
import EventImport from "./components/EventImport";
import ErrorBoundary from "./components/ErrorBoundary";
import AuthScreen from "./components/AuthScreen";
import { AppProvider, useApp } from "./store/AppStore";
import { AuthProvider, useAuth } from "./store/AuthStore";
import { uid } from "./lib/id";
import { addDays, DAY_NAMES, startOfWeek, toISO } from "./lib/time";
import type { Calendar, CalEvent, Task } from "./types";
import styles from "./App.module.css";

type CalEdit = { calendar: Calendar | null } | null;
type EventEdit = { event: CalEvent; isNew: boolean } | null;
type TaskEdit = { task: Task | null } | null;

function CalendarApp() {
  const { planWeek, calendars } = useApp();

  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState<Date>(() => new Date());

  const [calEdit, setCalEdit] = useState<CalEdit>(null);
  const [eventEdit, setEventEdit] = useState<EventEdit>(null);
  const [taskEdit, setTaskEdit] = useState<TaskEdit>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const weekStart = useMemo(() => startOfWeek(anchor), [anchor]);
  const gridDays = useMemo(
    () =>
      view === "day"
        ? [anchor]
        : DAY_NAMES.map((_, i) => addDays(weekStart, i)),
    [view, anchor, weekStart],
  );

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  function shift(delta: number) {
    if (view === "day") setAnchor((a) => addDays(a, delta));
    else if (view === "week") setAnchor((a) => addDays(a, delta * 7));
    else setAnchor((a) => new Date(a.getFullYear(), a.getMonth() + delta, 1));
  }

  function newEvent(dateISO: string, start: number, end: number) {
    // Can't place an event without a calendar — guide new users to make one first.
    if (calendars.length === 0) {
      setCalEdit({ calendar: null });
      return;
    }
    setEventEdit({
      event: { id: uid(), calendarId: "", title: "", date: dateISO, start, end, kind: "fixed" },
      isNew: true,
    });
  }

  // The date range the task rail should show tasks for (the current view period).
  const taskRange = useMemo(() => {
    if (view === "day") return { start: toISO(anchor), end: toISO(anchor) };
    if (view === "month") {
      const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
      const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
      return { start: toISO(first), end: toISO(last) };
    }
    return { start: toISO(weekStart), end: toISO(addDays(weekStart, 6)) };
  }, [view, anchor, weekStart]);

  function handlePlan() {
    planWeek();
    setToast("Re-planned — work blocks placed around your fixed events.");
  }

  return (
    <div className={styles.app}>
      <TopBar
        view={view}
        anchor={anchor}
        weekStart={weekStart}
        onView={setView}
        onToday={() => setAnchor(new Date())}
        onPrev={() => shift(-1)}
        onNext={() => shift(1)}
        onPlan={handlePlan}
      />
      <div className={styles.body}>
        <Sidebar
          anchor={anchor}
          onSelectDate={setAnchor}
          onNewCalendar={() => setCalEdit({ calendar: null })}
          onEditCalendar={(calendar) => setCalEdit({ calendar })}
          onNewEvent={() => newEvent(toISO(anchor), 9, 10)}
          onOpenSettings={() => setSettingsOpen(true)}
          onImport={() => setImportOpen(true)}
        />
        {view === "month" ? (
          <MonthGrid
            anchor={anchor}
            onOpenDay={(date) => {
              setAnchor(date);
              setView("day");
            }}
          />
        ) : (
          <WeekGrid
            days={gridDays}
            onCreateEvent={newEvent}
            onEditEvent={(event) => setEventEdit({ event, isNew: false })}
          />
        )}
        <TaskRail
          rangeStart={taskRange.start}
          rangeEnd={taskRange.end}
          onNewTask={() => setTaskEdit({ task: null })}
          onEditTask={(task) => setTaskEdit({ task })}
        />
      </div>

      {toast && <div className={styles.toast}>✦ {toast}</div>}

      {calEdit && (
        <CalendarEditor calendar={calEdit.calendar} onClose={() => setCalEdit(null)} />
      )}
      {eventEdit && (
        <EventEditor
          event={eventEdit.event}
          isNew={eventEdit.isNew}
          onClose={() => setEventEdit(null)}
        />
      )}
      {taskEdit && (
        <TaskEditor task={taskEdit.task} onClose={() => setTaskEdit(null)} />
      )}
      {settingsOpen && <SettingsEditor onClose={() => setSettingsOpen(false)} />}
      {importOpen && <EventImport onClose={() => setImportOpen(false)} />}
    </div>
  );
}

function Gate() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className={styles.splash}>
        <span aria-hidden="true">◈</span> CADENCE
      </div>
    );
  }
  if (!user) return <AuthScreen />;
  // Remount the data store per user so each session loads its own workspace.
  return (
    <AppProvider key={user.id}>
      <CalendarApp />
    </AppProvider>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </ErrorBoundary>
  );
}
