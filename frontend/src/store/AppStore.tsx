/* Central app state: calendars + events + tasks + settings, plus actions.
   Offline-first: renders instantly from a localStorage cache, then reconciles
   with the FastAPI backend (source of truth) and syncs changes back. If the
   backend is down, the app keeps working on localStorage alone. The
   component-facing API (useApp) is unchanged. */

import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Calendar, CalEvent, Settings, Task } from "../types";
import { sampleCalendars, sampleEvents, sampleTasks } from "../data/sampleData";
import {
  configFromSettings,
  DEFAULT_SETTINGS,
  schedule,
} from "../lib/scheduler";
import { getState, putState } from "../lib/api";
import { startOfDay, toISO } from "../lib/time";

interface AppState {
  calendars: Calendar[];
  events: CalEvent[];
  tasks: Task[];
  settings: Settings;
}

type Action =
  | { type: "addCalendar"; calendar: Calendar }
  | { type: "updateCalendar"; id: string; patch: Partial<Calendar> }
  | { type: "deleteCalendar"; id: string }
  | { type: "toggleCalendar"; id: string }
  | { type: "addEvent"; event: CalEvent }
  | { type: "updateEvent"; id: string; patch: Partial<CalEvent> }
  | { type: "deleteEvent"; id: string }
  | { type: "deleteEvents"; ids: string[] }
  | { type: "addTask"; task: Task }
  | { type: "updateTask"; id: string; patch: Partial<Task> }
  | { type: "deleteTask"; id: string }
  | { type: "updateSettings"; patch: Partial<Settings> }
  | { type: "planWeek" }
  | { type: "planTask"; id: string }
  | { type: "hydrate"; state: AppState }
  | { type: "reset" };

const STORAGE_KEY = "cadence.state.v3";

function seed(): AppState {
  return {
    calendars: sampleCalendars,
    events: sampleEvents,
    tasks: sampleTasks,
    settings: DEFAULT_SETTINGS,
  };
}

// A brand-new workspace: nothing until the user creates it. New accounts start
// here (no demo data); "Reset demo data" in the sidebar loads the samples.
function emptyState(): AppState {
  return { calendars: [], events: [], tasks: [], settings: DEFAULT_SETTINGS };
}

function initialState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      // Accept only data that matches the current (real-dates) model. Stale
      // caches from an earlier model would otherwise crash the render.
      const shapeOk =
        Array.isArray(parsed.calendars) &&
        Array.isArray(parsed.events) &&
        Array.isArray(parsed.tasks) &&
        parsed.events.every((e) => typeof e.date === "string") &&
        parsed.tasks.every((t) => typeof t.dueDate === "string");
      if (shapeOk) {
        return { ...parsed, settings: parsed.settings ?? DEFAULT_SETTINGS };
      }
    }
  } catch {
    /* ignore malformed storage and fall back to an empty workspace */
  }
  return emptyState();
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "addCalendar":
      return { ...state, calendars: [...state.calendars, action.calendar] };

    case "updateCalendar":
      return {
        ...state,
        calendars: state.calendars.map((c) =>
          c.id === action.id ? { ...c, ...action.patch } : c,
        ),
      };

    case "deleteCalendar":
      // Deleting a calendar removes its events and tasks too.
      return {
        ...state,
        calendars: state.calendars.filter((c) => c.id !== action.id),
        events: state.events.filter((e) => e.calendarId !== action.id),
        tasks: state.tasks.filter((t) => t.calendarId !== action.id),
      };

    case "toggleCalendar":
      return {
        ...state,
        calendars: state.calendars.map((c) =>
          c.id === action.id ? { ...c, visible: !c.visible } : c,
        ),
      };

    case "addEvent":
      return { ...state, events: [...state.events, action.event] };

    case "updateEvent":
      return {
        ...state,
        events: state.events.map((e) =>
          e.id === action.id ? { ...e, ...action.patch } : e,
        ),
      };

    case "deleteEvent":
      return {
        ...state,
        events: state.events.filter((e) => e.id !== action.id),
      };

    case "deleteEvents": {
      const drop = new Set(action.ids);
      return {
        ...state,
        events: state.events.filter((e) => !drop.has(e.id)),
      };
    }

    case "addTask":
      return { ...state, tasks: [...state.tasks, action.task] };

    case "updateTask":
      return {
        ...state,
        tasks: state.tasks.map((t) =>
          t.id === action.id ? { ...t, ...action.patch } : t,
        ),
      };

    case "deleteTask":
      // Removing a task removes the work blocks it generated.
      return {
        ...state,
        tasks: state.tasks.filter((t) => t.id !== action.id),
        events: state.events.filter((e) => e.taskId !== action.id),
      };

    case "updateSettings":
      return { ...state, settings: { ...state.settings, ...action.patch } };

    case "planWeek": {
      // Drop old auto-generated (unlocked) work blocks, keep everything
      // else as "busy", and let the scheduler re-fill around it using the
      // user's current preferences.
      const keep = state.events.filter(
        (e) => !(e.kind === "block" && e.taskId && !e.locked),
      );
      const generated = schedule(
        state.tasks,
        keep,
        configFromSettings(state.settings),
        toISO(startOfDay(new Date())),
      );
      return { ...state, events: [...keep, ...generated] };
    }

    case "planTask": {
      // Allot time for a SINGLE task (opt-in from the task inbox): drop only
      // this task's old auto blocks, keep everything else busy, and schedule it.
      const task = state.tasks.find((t) => t.id === action.id);
      if (!task) return state;
      const keep = state.events.filter(
        (e) => !(e.kind === "block" && e.taskId === action.id && !e.locked),
      );
      const generated = schedule(
        [task],
        keep,
        configFromSettings(state.settings),
        toISO(startOfDay(new Date())),
      );
      return { ...state, events: [...keep, ...generated] };
    }

    case "hydrate":
      return action.state;

    case "reset":
      return seed();
  }
}

interface AppContextValue extends AppState {
  addCalendar: (calendar: Calendar) => void;
  updateCalendar: (id: string, patch: Partial<Calendar>) => void;
  deleteCalendar: (id: string) => void;
  toggleCalendar: (id: string) => void;
  addEvent: (event: CalEvent) => void;
  updateEvent: (id: string, patch: Partial<CalEvent>) => void;
  deleteEvent: (id: string) => void;
  deleteEvents: (ids: string[]) => void;
  addTask: (task: Task) => void;
  updateTask: (id: string, patch: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  planWeek: () => void;
  planTask: (id: string) => void;
  resetAll: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const [synced, setSynced] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  // On mount: reconcile with the backend. If it has data, it wins (hydrate);
  // if it's empty, seed it with what we have; if it's down, stay local.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const remote = await getState();
        if (cancelled) return;
        if (remote.calendars.length > 0) {
          dispatch({ type: "hydrate", state: remote });
        } else {
          await putState(stateRef.current);
        }
      } catch {
        /* backend unreachable — keep working from localStorage */
      } finally {
        if (!cancelled) setSynced(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist every change: always to localStorage (offline cache), and — once
  // we've reconciled — debounced to the backend.
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (!synced) return;
    const t = setTimeout(() => {
      putState(state).catch(() => {
        /* offline; localStorage still holds the change */
      });
    }, 400);
    return () => clearTimeout(t);
  }, [state, synced]);

  const value: AppContextValue = {
    ...state,
    addCalendar: (calendar) => dispatch({ type: "addCalendar", calendar }),
    updateCalendar: (id, patch) =>
      dispatch({ type: "updateCalendar", id, patch }),
    deleteCalendar: (id) => dispatch({ type: "deleteCalendar", id }),
    toggleCalendar: (id) => dispatch({ type: "toggleCalendar", id }),
    addEvent: (event) => dispatch({ type: "addEvent", event }),
    updateEvent: (id, patch) => dispatch({ type: "updateEvent", id, patch }),
    deleteEvent: (id) => dispatch({ type: "deleteEvent", id }),
    deleteEvents: (ids) => dispatch({ type: "deleteEvents", ids }),
    addTask: (task) => dispatch({ type: "addTask", task }),
    updateTask: (id, patch) => dispatch({ type: "updateTask", id, patch }),
    deleteTask: (id) => dispatch({ type: "deleteTask", id }),
    updateSettings: (patch) => dispatch({ type: "updateSettings", patch }),
    planWeek: () => dispatch({ type: "planWeek" }),
    planTask: (id) => dispatch({ type: "planTask", id }),
    resetAll: () => dispatch({ type: "reset" }),
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}
