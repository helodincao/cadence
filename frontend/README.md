# Cadence — Frontend (step 06: syllabus import)

React + TypeScript + Vite. Hand-built week grid (no calendar library), styled
with CSS Modules.

## Look & feel — "Stark HUD"

A single, committed dark theme inspired by the Jarvis heads-up display: deep
blue-black ground with a faint blueprint grid + arc-reactor glow, cyan neon
readouts, gold/red state accents, hairline glowing panel borders with corner
brackets, 24-hour time, and a reticle "now" marker. There is **no light theme**
by design — the aesthetic only works dark.

Typography (self-hosted via `@fontsource`, no CDN):
- **Orbitron** — display / brand / day numbers
- **Rajdhani** — UI + event titles
- **Share Tech Mono** — time and data readouts

All colors, glows, fonts, and grid geometry are tokens in `src/index.css`;
components pull from them, so re-tinting the whole HUD is a one-file change.

## Run it

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173
```

Other scripts: `npm run build` (type-check + production build),
`npm run type-check` (types only), `npm run preview` (serve the build).

## What's here (and what's faked)

Calendars, events, and **tasks** are real, editable state, persisted to
`localStorage` (no backend yet). `src/data/sampleData.ts` is only the *seed* used
on first run or after "Reset demo data" — and it ships already run through the
scheduler, so first load shows a planned week.

**Working:**
- Three-pane layout: sidebar, week grid, task inbox.
- **Calendars**: create (`＋` by "My calendars"), edit/recolor/delete (✎ on hover),
  toggle visibility. Deleting a calendar removes its events and tasks.
- **Events**: click any empty slot to create one; click an event to edit/delete.
- **Drag & resize**: grab a block and it *detaches* — floating freely with the
  cursor (portaled above the grid, lifted + tilted) while a dashed outline shows
  the slot it'll snap into; drop to land it there (nearest day + half hour). Drag
  the bottom edge to resize. Hand-placing a work block auto-**locks** it, so Plan
  Week flows the other blocks around your choice.
- **Tasks** (right rail): create/edit/delete with due day, effort estimate, and
  priority; each shows a scheduled-vs-effort bar and flags unscheduled hours.
  A checkbox marks a task done (dims it, excludes it from scheduling).
- **Scheduler**: "Plan Week" (top bar) runs `lib/scheduler.ts` — a pure function
  that drops old auto blocks and greedily places each task's hours into free time,
  ranked by priority → due date → effort, capped per day, spread across days,
  never past the due day. Locked blocks are respected; manual blocks are left alone.
- **Preferences** (sidebar → Preferences): a questionnaire — work hours, max focus
  block, max work/day, weekends on/off, and a protected daily break — saved in the
  store and turned into the scheduler's config (`configFromSettings`). Saving
  re-plans immediately, so you see the constraints take effect.
- **Import syllabus** (sidebar → Import syllabus): paste syllabus text → the
  FastAPI backend (`../backend`) extracts tasks → review them (calendar picker,
  per-task checkboxes) → add the selected ones to the inbox. Falls back to a regex
  parse (flagged "APPROX") when the backend has no `ANTHROPIC_API_KEY`. This is the
  first feature that needs the backend running (`cd backend && uvicorn main:app
  --port 8000`).
- **Navigation & views**: Today / ‹ › move by day, week, or month; the top-bar
  switch toggles **Day / Week / Month** (Month is its own grid — click a day to
  drop into Day view). The mini-month browses months and its day cells navigate.
- **Real dates**: events carry an ISO `date` and tasks a `dueDate` — each week
  shows its own content (no recurring template). The scheduler plans across real
  dates from **today** up to each task's due date, honoring the same constraints.
- **Persistence (offline-first)**: the store renders instantly from a
  `localStorage` cache, then reconciles with the FastAPI backend
  (`GET/PUT /api/state`, SQLite) — the backend is the source of truth when it's
  up, and the app keeps working from `localStorage` when it's down. "Reset demo
  data" reseeds a few weeks of dated events/tasks relative to today.

## Layout

```
src/
  main.tsx              app entry + font imports
  App.tsx               composes panes, owns which editor modal is open
  index.css             HUD design tokens + reset
  types.ts              Calendar, CalEvent (date), Task (dueDate), Settings
  store/AppStore.tsx    Context + useReducer: calendars/events/tasks/settings
  lib/time.ts           date/week math, ISO helpers (toISO/fromISO), formatting
  lib/id.ts             unique id generator
  lib/scheduler.ts      PURE scheduler over real dates (plan from today → due)
  data/sampleData.ts    seed calendars + tasks + a pre-planned week
  components/
    TopBar.tsx          brand, view-aware label, nav, Day/Week/Month switch, Plan
    Sidebar.tsx         mini-month (browse + navigate) + calendar CRUD + actions
    WeekGrid.tsx        renders N day columns (Day=1, Week=7); click-create, DRAG
    MonthGrid.tsx       month view — recurring events per day, click a day
    EventBlock.tsx      one positioned block; move + resize gestures
    TaskRail.tsx        task inbox: cards, progress, done toggle
    Select.tsx          themed dropdown replacing the native <select>
    Modal.tsx           reusable HUD dialog shell
    CalendarEditor.tsx  create/edit/delete a calendar
    EventEditor.tsx     create/edit/delete an event
    TaskEditor.tsx      create/edit/delete a task
    SettingsEditor.tsx  the scheduling-preferences questionnaire
    SyllabusImport.tsx  paste → parse (backend) → review → add tasks
    forms.module.css    shared form styling for the editors
  lib/api.ts            fetch client for the FastAPI backend (:8000)
```

The Python service lives in `../backend` (FastAPI + Anthropic SDK) — see its
README.

## Step 07 status

- ✅ **Real dates** — events/tasks use ISO dates; scheduler plans over a real
  date range.
- ✅ **Backend persistence** — SQLite + `GET/PUT /api/state`; the store syncs to
  it (offline-first). Data survives a `localStorage` wipe (loaded from the DB).
- ⏳ **Accounts / auth** — still single-user (one shared workspace). Adding
  signup/login + per-user data is the remaining "→ public website" piece. See
  `../docs/PLAN.md` §5.
