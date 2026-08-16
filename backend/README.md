# Cadence — Backend (syllabus parsing)

A small **FastAPI** service that turns pasted syllabus text into tasks. It uses
the Anthropic SDK (structured outputs) when an API key is present, and falls back
to a regex heuristic when it isn't — so the feature runs either way.

## Run it

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

The frontend (`../frontend`, on :5173/:5174) calls this at `http://localhost:8000`.
CORS is already allowed for those origins.

## Enable real AI parsing

Without a key, `/api/parse-syllabus` returns a **heuristic** parse (regex over the
lines) and marks `"source": "heuristic"`. To use Claude instead, set your key
before starting the server:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
uvicorn main:app --reload --port 8000
```

Then the response is `"source": "ai"`. Check which mode is active:

```bash
curl localhost:8000/api/health
# {"status":"ok","model":"claude-opus-5","ai_enabled":true}
```

**Model & cost.** Defaults to `claude-opus-5` (Anthropic's recommended default).
Syllabus extraction is a simple task, so if you want to spend less, point it at a
cheaper model:

```bash
export CADENCE_MODEL=claude-haiku-4-5
```

## Endpoints

| Method | Path                   | Body            | Returns |
|--------|------------------------|-----------------|---------|
| GET    | `/api/health`          | —               | `{status, model, ai_enabled}` |
| POST   | `/api/parse-syllabus`  | `{ "text": … }` | `{ tasks: [...], source: "ai" \| "heuristic" }` |
| GET    | `/api/state`           | —               | the whole workspace `{ calendars, events, tasks, settings }` |
| PUT    | `/api/state`           | a full workspace | `{ ok: true }` — replaces everything (transactional) |

Parsed task: `{ title, dueDate (ISO or null), dueDateText, effortHours, priority }`.
The AI resolves real dates; the heuristic can't, so `dueDate` is null and the
frontend fills a default.

## Persistence

`/api/state` reads/writes a **SQLite** database (`cadence.db`, created on first
run, git-ignored) via SQLAlchemy — tables for calendars, events, tasks, and a
singleton settings row. It's **single-user** (one shared workspace, no auth yet).
The frontend is offline-first: it syncs its whole state here (debounced PUT) and
loads it on startup (`GET`), falling back to its own `localStorage` if the backend
is down.

## Files

```
backend/
  main.py            FastAPI app, CORS, parse + /api/state routes
  extractor.py       AI extraction (Anthropic SDK) + heuristic fallback
  db.py              SQLAlchemy models + engine (SQLite)
  requirements.txt
```

## Next

- **Accounts** — the remaining "→ public website" piece: signup/login + per-user
  data (scope every row to a user, add auth). Swap SQLite for Postgres when
  deploying. See `../docs/PLAN.md` §5.
