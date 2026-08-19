# Cadence — AI Calendar

An AI-assisted scheduler for people juggling school, work, health, and side
projects. You import your syllabi and commitments, and it decides **when** the
work actually happens — laying homework and prep onto a calendar you can see,
edit by hand, and re-plan around your changes.

Built as a full-stack learning project, with a "Stark HUD" (Iron Man / Jarvis)
visual style.

---

## What it does

- **Multiple calendars** (School, Lab, Club, …) — create, color, toggle
  visibility, Google-Calendar style.
- **Events & tasks** — fixed commitments plus to-dos with a due date, effort
  estimate, and priority.
- **A deterministic scheduler** — "Plan Week" places each task's hours into free
  time around your fixed events, ranked by priority → due date → effort, capped
  per day, honoring your work hours / weekends / breaks.
- **Drag & re-flow** — pick up a block, drop it, and the rest re-plans around
  your locked choice.
- **Day / Week / Month views** with real-date navigation.
- **Scheduling preferences** — a questionnaire (work hours, focus length,
  weekends, protected breaks) that feeds the scheduler.
- **Syllabus import (AI)** — paste syllabus text and Claude extracts the graded
  work into tasks you confirm (with a regex fallback when no API key is set).
- **Persistence** — offline-first: renders from a local cache, syncs to a
  SQLite-backed API, and keeps working if the backend is down.

> Design principle: the scheduler is a **pure, deterministic function**. The LLM
> only *parses* syllabi and *suggests* — it never silently rewrites your calendar.

---

## Tech stack

| Layer | Stack |
|-------|-------|
| Frontend | React + TypeScript + Vite, CSS Modules (hand-built calendar grid, no calendar lib) |
| Backend | Python + FastAPI, SQLAlchemy + SQLite |
| AI | Anthropic SDK (Claude) for syllabus parsing |

## Structure

```
ai_calendar/
  frontend/   React + TS app (the calendar UI)
  backend/    FastAPI service (syllabus parsing + persistence)
  docs/       project plan + wireframe
```

## Getting started

Two servers. **Backend** (creates a local `cadence.db`):

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8010
```

For real AI parsing of syllabi/spec files (otherwise it uses a regex fallback),
put a key in `backend/.env` — copy `backend/.env.example` and fill in one of:

- `GEMINI_API_KEY` — Google Gemini, has a free tier ([get one](https://aistudio.google.com/apikey))
- `ANTHROPIC_API_KEY` — Anthropic, paid, strongest quality

If both are set, `CADENCE_PROVIDER=gemini|anthropic` picks the winner.

**Frontend:**

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

The frontend talks to the backend at `http://127.0.0.1:8010` by default; set
`VITE_API_BASE` in `frontend/.env` to point elsewhere (see `frontend/.env.example`).

See `frontend/README.md` and `backend/README.md` for details.

## Status

Working end to end: calendars, events, tasks, the scheduler, drag/re-flow,
day/week/month navigation, preferences, syllabus import, and SQLite persistence.

**Next:** accounts / authentication (per-user data) to go from single-user to a
multi-user website — see `docs/PLAN.md`.
