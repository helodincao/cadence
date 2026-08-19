"""Cadence backend — FastAPI service.

- Syllabus parsing:  POST /api/parse-syllabus
- Persistence:       GET/PUT /api/state  (SQLite, single-user, no auth yet)

Run:  uvicorn main:app --reload --port 8000
"""

from typing import List, Literal, Optional

from dotenv import load_dotenv

# Load backend/.env (ANTHROPIC_API_KEY, optional CADENCE_MODEL) before importing
# extractor, which reads those at import time. .env is gitignored — keep secrets
# there, never in code. This must run before `from extractor import ...`.
load_dotenv()

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import db
from db import Calendar as CalRow, Event as EvRow, SettingsRow, SessionLocal, Task as TaskRow
from extractor import active_model, active_provider, import_plan

app = FastAPI(title="Cadence API", version="0.2.0")
db.init_db()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------------------------------
# AI import — files + instruction → tasks + events
# --------------------------------------------------------------------------
@app.get("/api/health")
def health():
    provider = active_provider()
    return {
        "status": "ok",
        "provider": provider,
        "model": active_model(),
        "ai_enabled": provider != "none",
    }


@app.post("/api/import")
async def import_details(
    prompt: str = Form(""),
    deadline: str = Form(""),
    files: List[UploadFile] = File(default=[]),
):
    """Turn an instruction + uploaded files into tasks + events to schedule.

    When ``deadline`` (ISO YYYY-MM-DD) is given, the plan is framed as work
    sessions leading up to that date (the event editor's "plan work" flow).

    Returns {note, tasks, events, source}.
    """
    uploaded = [((f.filename or "file"), await f.read(), (f.content_type or "")) for f in files]
    try:
        result, source = import_plan(prompt, uploaded, deadline or None)
    except Exception as e:  # provider outage, rate limit, bad key, etc.
        raise HTTPException(
            status_code=502,
            detail=(
                f"The AI provider ({active_provider()}) couldn't complete the "
                f"request ({type(e).__name__}). It may be busy or rate-limited — "
                "try again in a moment."
            ),
        )
    return {**result, "source": source}


# --------------------------------------------------------------------------
# State persistence — the frontend syncs its whole state here.
# Field names are camelCase to match the frontend store exactly.
# --------------------------------------------------------------------------
class CalendarM(BaseModel):
    id: str
    name: str
    color: str
    visible: bool


class EventM(BaseModel):
    id: str
    calendarId: str
    title: str
    date: str
    start: float
    end: float
    kind: Literal["fixed", "block"]
    locked: Optional[bool] = None
    taskId: Optional[str] = None


class TaskM(BaseModel):
    id: str
    calendarId: str
    title: str
    dueDate: str
    effortHours: float
    priority: Literal["low", "med", "high"]
    done: Optional[bool] = None


class SettingsM(BaseModel):
    workDayStart: float
    workDayEnd: float
    maxFocusHours: float
    maxWorkHoursPerDay: float
    includeWeekends: bool
    breakEnabled: bool
    breakStart: float
    breakEnd: float


DEFAULT_SETTINGS = SettingsM(
    workDayStart=8,
    workDayEnd=21,
    maxFocusHours=2,
    maxWorkHoursPerDay=4,
    includeWeekends=True,
    breakEnabled=False,
    breakStart=12,
    breakEnd=13,
)


class StateM(BaseModel):
    calendars: List[CalendarM]
    events: List[EventM]
    tasks: List[TaskM]
    settings: SettingsM


@app.get("/api/state", response_model=StateM)
def get_state():
    with SessionLocal() as s:
        calendars = [
            CalendarM(id=c.id, name=c.name, color=c.color, visible=c.visible)
            for c in s.query(CalRow).all()
        ]
        events = [
            EventM(
                id=e.id, calendarId=e.calendar_id, title=e.title, date=e.date,
                start=e.start, end=e.end, kind=e.kind,
                locked=e.locked or None, taskId=e.task_id,
            )
            for e in s.query(EvRow).all()
        ]
        tasks = [
            TaskM(
                id=t.id, calendarId=t.calendar_id, title=t.title, dueDate=t.due_date,
                effortHours=t.effort_hours, priority=t.priority, done=t.done or None,
            )
            for t in s.query(TaskRow).all()
        ]
        row = s.query(SettingsRow).first()
        settings = (
            SettingsM(
                workDayStart=row.work_day_start, workDayEnd=row.work_day_end,
                maxFocusHours=row.max_focus_hours, maxWorkHoursPerDay=row.max_work_hours_per_day,
                includeWeekends=row.include_weekends, breakEnabled=row.break_enabled,
                breakStart=row.break_start, breakEnd=row.break_end,
            )
            if row
            else DEFAULT_SETTINGS
        )
    return StateM(calendars=calendars, events=events, tasks=tasks, settings=settings)


@app.put("/api/state")
def put_state(state: StateM):
    """Replace the whole workspace (simple + transactional for single-user)."""
    with SessionLocal() as s:
        s.query(EvRow).delete()
        s.query(TaskRow).delete()
        s.query(CalRow).delete()
        s.query(SettingsRow).delete()

        for c in state.calendars:
            s.add(CalRow(id=c.id, name=c.name, color=c.color, visible=c.visible))
        for e in state.events:
            s.add(EvRow(
                id=e.id, calendar_id=e.calendarId, title=e.title, date=e.date,
                start=e.start, end=e.end, kind=e.kind,
                locked=bool(e.locked), task_id=e.taskId,
            ))
        for t in state.tasks:
            s.add(TaskRow(
                id=t.id, calendar_id=t.calendarId, title=t.title, due_date=t.dueDate,
                effort_hours=t.effortHours, priority=t.priority, done=bool(t.done),
            ))
        g = state.settings
        s.add(SettingsRow(
            id=1, work_day_start=g.workDayStart, work_day_end=g.workDayEnd,
            max_focus_hours=g.maxFocusHours, max_work_hours_per_day=g.maxWorkHoursPerDay,
            include_weekends=g.includeWeekends, break_enabled=g.breakEnabled,
            break_start=g.breakStart, break_end=g.breakEnd,
        ))
        s.commit()
    return {"ok": True}
