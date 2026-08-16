# AI Calendar — Project Plan

An AI-assisted scheduler for people juggling school, work, health, and side
projects. You import your sources of truth (syllabi, due dates, shifts,
commitments), answer a short questionnaire about how you work, and the app
lays out *when* to actually do everything — including the homework blocks, not
just the deadlines. You can drag things around; the schedule re-flows to
respect your constraints.

Google Calendar is the interaction model: multiple named calendars, each a
color, each toggleable on/off in the view.

---

## 1. Core concept

Three ideas the whole product is built on:

1. **Deadlines are not a schedule.** A syllabus tells you *when things are
   due*. It does not tell you *when to work*. The AI's job is to turn a pile of
   due dates + fixed commitments + your energy profile into concrete work
   blocks on a calendar.
2. **Everything lives on a calendar you can see and edit.** No black box. Every
   AI decision shows up as a normal, draggable event. Manual edits are
   first-class — the AI treats your changes as new constraints and re-plans
   around them.
3. **Priority and effort are inputs you control.** You can mark a task
   high-priority or say "this will take ~6 hours," and the allocation changes
   accordingly.

---

## 2. Key concepts / vocabulary

| Term | Meaning |
|------|---------|
| **Calendar** | A named, colored collection of events (e.g. "CSCI 3155", "Lab", "Health", "Job Hunt"). Toggle visibility like Google Calendar. |
| **Fixed event** | Something at a set time you don't move: a lecture, a shift, a club meeting, an appointment. |
| **Task** | Something with a deadline and an effort estimate but no fixed time: "Finish PS4," "Apply to 3 jobs." Tasks are what the AI *schedules*. |
| **Work block** | An AI-generated (or manual) chunk of time allocated to a task. A 6-hour task might become three 2-hour blocks across three days. |
| **Constraint** | A rule the scheduler must respect: work hours, no-work windows, max focus time/day, buffer before deadlines. Mostly comes from the questionnaire. |
| **Plan** | The current computed arrangement of work blocks. Re-planning produces a new plan; you can preview before accepting. |

---

## 3. Feature list

### MVP (v1 — build this first)
- **Calendars**: create / rename / color / delete; per-calendar visibility toggle.
- **Manual events**: create fixed events (title, calendar, start/end, repeat).
- **Tasks**: title, calendar, due date, effort estimate, priority (Low/Med/High).
- **Syllabus / schedule import**: paste text or upload a file (PDF, .ics, image);
  AI extracts candidate due dates and fixed events into a review screen where
  you confirm/edit before anything lands on the calendar.
- **Questionnaire (onboarding)**: work hours, focus-session length, break
  preference, no-work windows, buffer-before-deadline, weekend policy.
- **Auto-schedule**: AI places work blocks for all tasks into free time,
  respecting constraints and priority. Shown as a preview diff you accept.
- **Manual tweaking**: drag/resize/delete any block; on change the app offers to
  re-flow the rest around your edit (or leave it, your call).
- **Week / Day / Month views** with the multi-calendar overlay.

### v2 (after MVP feels good)
- Recurring tasks and templates ("weekly reading," "gym 3x/week").
- Smart rebalancing when you fall behind ("you missed 2 blocks — reschedule?").
- Energy/time-of-day modeling (deep work in the morning, admin in the afternoon).
- Notifications / reminders (before blocks, before deadlines).
- Task dependencies ("can't start B until A is done").
- iCal / Google Calendar two-way sync.

### v3 / "someday" (the multi-user website)
- Accounts, auth, per-user data isolation.
- Shared calendars (club, lab team).
- Mobile-friendly / installable PWA.
- Analytics: estimated vs. actual time, where the week actually went.

---

## 4. Screens

1. **Onboarding questionnaire** — first run only; editable later in Settings.
2. **Import & review** — paste/upload → AI-extracted items → confirm.
3. **Main calendar** — the home screen. Sidebar (mini-month + calendar list +
   AI actions), main grid (week/day/month), right-hand AI panel (task inbox,
   "Plan my week," explanations).
4. **Task detail** — edit effort, priority, deadline, split preferences.
5. **Settings** — calendars, constraints/questionnaire answers, account (later).

See the wireframe artifact for the main-calendar layout.

---

## 5. Suggested tech stack

Chosen for maintainability and a clean path from "just me" to "real website."

- **Frontend**: React + TypeScript + Vite. (Matches what you're already
  learning; huge ecosystem for calendars.)
- **Calendar UI**: **hand-built with CSS grid** (decided). More to build than
  pulling in FullCalendar, but full control over drag/resize/re-flow behavior and
  more learning. The wireframe's week grid is the starting reference.
- **State/data**: TanStack Query for server state + a light store (Zustand) for
  view state (which calendars are visible, current date).
- **Styling**: Tailwind CSS, or CSS Modules if you prefer plain CSS.
- **Backend**: **FastAPI (Python)** (decided). Pairs naturally with the AI/LLM
  parsing work and is pleasant to maintain. This is where syllabus parsing and
  the scheduler live.
- **AI layer**: an LLM (Claude) for two jobs — (a) extracting structured
  events/tasks from messy syllabus text, (b) proposing a schedule. The
  *placement* math (fitting blocks into free time) can be a deterministic
  algorithm the LLM only advises, which keeps it debuggable.
- **Database**: SQLite for local/dev, Postgres when it becomes multi-user. Use
  an ORM (Prisma for Node, SQLAlchemy for Python) so the swap is painless.
- **Auth (v3)**: Clerk/Auth0 or Supabase Auth — don't hand-roll it.

### Why this is "maintainable"
- Clear seam between **frontend** (rendering + editing) and **backend**
  (parsing + scheduling), so either side can change independently.
- The **scheduler is a pure function**: `(tasks, events, constraints) → plan`.
  That makes it unit-testable and swappable without touching UI.
- **AI is contained** to parsing + suggestion, always behind a human-review
  step, so a bad LLM output never silently corrupts your calendar.

---

## 6. Data model (first cut)

```
User            id, name, email, questionnaire_answers (JSON)
Calendar        id, user_id, name, color, is_visible
Event           id, calendar_id, title, start, end, rrule?, is_fixed
Task            id, calendar_id, title, due_at, effort_minutes,
                priority (1-3), status, split_prefs (JSON)
WorkBlock       id, task_id, start, end, is_ai_generated, is_locked
Constraint      id, user_id, type, value   # or fold into questionnaire JSON
```

`WorkBlock` is the bridge between the abstract Task and the concrete calendar.
Deleting/moving a block never deletes the Task — it just changes when the work
happens.

---

## 7. The scheduling loop (how "auto-schedule" works)

1. Gather: visible **Tasks** (with effort + priority + due date), **fixed
   Events**, and **Constraints** (work hours, focus length, buffers).
2. Compute **free time** = work hours − fixed events − no-work windows.
3. **Rank** tasks by priority, then urgency (due date), then effort.
4. **Place** work blocks greedily into free slots, highest-priority first,
   respecting max-focus-per-day and leaving buffer before each deadline.
5. Produce a **plan diff** (what will be added/moved) → user previews → accepts.
6. On any **manual edit**, mark that block `is_locked` and re-run placement for
   the unlocked remainder.

Start deterministic and simple; let the LLM *suggest refinements* ("you have
three hard deadlines Thursday — want to pull work earlier?") rather than owning
the placement.

---

## 8. Suggested build order

1. Static calendar shell: sidebar + week grid, hardcoded events. *(learn the UI)*
2. Calendars CRUD + visibility toggles.
3. Manual events + tasks (no AI yet).
4. Deterministic scheduler → work blocks from tasks.
5. Drag/resize + re-flow.
6. Questionnaire → feeds constraints.
7. AI syllabus import → review screen.
8. AI schedule suggestions on top of the deterministic base.
9. Accounts + Postgres → the public website.

---

## 9. Decisions locked in

- **Frontend calendar**: hand-built CSS-grid week view (not FullCalendar).
- **Backend**: Python / FastAPI.
- **AI role**: *advises*, doesn't own — deterministic scheduler places blocks;
  the LLM parses syllabi and suggests refinements, always behind human review.

Still open for later: whether to use an ORM from day one (recommend yes —
SQLAlchemy) and when to introduce the LLM vs. shipping the deterministic core first
(recommend: deterministic core first, per the build order above).
