"""Cadence backend — FastAPI service.

- Auth:          POST /api/auth/signup | /login | /logout, GET /api/auth/me
- AI import:     POST /api/import           (session required)
- Persistence:   GET/PUT /api/state         (session required, per-user)

Sessions are httpOnly cookies; each user's calendars/events/tasks/settings are
scoped by user_id. Run:  uvicorn main:app --reload --port 8010
"""

import datetime
import re
import uuid
from typing import List, Literal, Optional

from dotenv import load_dotenv

# Load backend/.env (ANTHROPIC_API_KEY / GEMINI_API_KEY, optional model vars)
# before importing extractor, which reads those at import time. .env is
# gitignored — keep secrets there, never in code.
load_dotenv()

from fastapi import Cookie, Depends, FastAPI, File, Form, HTTPException, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import auth
import db
from auth import current_user
from db import (
    Calendar as CalRow,
    Event as EvRow,
    SessionLocal,
    SettingsRow,
    Task as TaskRow,
    User,
)
from extractor import active_model, active_provider, import_plan

app = FastAPI(title="Cadence API", version="0.3.0")
db.init_db()

# Cookies require an explicit origin allow-list (no wildcard) with credentials.
# In dev the frontend usually reaches us through the Vite proxy (same-origin),
# but these keep direct cross-origin access working too.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    provider = active_provider()
    return {
        "status": "ok",
        "provider": provider,
        "model": active_model(),
        "ai_enabled": provider != "none",
    }


# --------------------------------------------------------------------------
# Auth
# --------------------------------------------------------------------------
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class Credentials(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    id: str
    email: str


def _set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=auth.COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        secure=False,  # dev over http; set True behind HTTPS in production
        max_age=auth.SESSION_DAYS * 24 * 3600,
        path="/",
    )


@app.post("/api/auth/signup", response_model=UserOut)
def signup(creds: Credentials, response: Response):
    email = creds.email.strip().lower()
    if not _EMAIL_RE.match(email):
        raise HTTPException(status_code=400, detail="Enter a valid email address.")
    if not (auth.MIN_PASSWORD_LEN <= len(creds.password) <= auth.MAX_PASSWORD_LEN):
        raise HTTPException(
            status_code=400,
            detail=f"Password must be {auth.MIN_PASSWORD_LEN}–{auth.MAX_PASSWORD_LEN} characters.",
        )
    with SessionLocal() as s:
        if s.query(User).filter(User.email == email).first():
            raise HTTPException(status_code=409, detail="That email is already registered.")
        # New accounts start with an empty workspace — the user builds their own.
        user = User(
            id=uuid.uuid4().hex,
            email=email,
            password_hash=auth.hash_password(creds.password),
            created_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
        )
        s.add(user)
        s.commit()
        uid = user.id
        uemail = user.email
    token = auth.create_session(uid)
    _set_session_cookie(response, token)
    return UserOut(id=uid, email=uemail)


@app.post("/api/auth/login", response_model=UserOut)
def login(creds: Credentials, response: Response):
    email = creds.email.strip().lower()
    with SessionLocal() as s:
        user = s.query(User).filter(User.email == email).first()
        if user is None or not auth.verify_password(creds.password, user.password_hash):
            raise HTTPException(status_code=401, detail="Wrong email or password.")
        uid, uemail = user.id, user.email
    token = auth.create_session(uid)
    _set_session_cookie(response, token)
    return UserOut(id=uid, email=uemail)


@app.post("/api/auth/logout")
def logout(response: Response, cadence_session: Optional[str] = Cookie(default=None)):
    if cadence_session:
        auth.delete_session(cadence_session)
    response.delete_cookie(auth.COOKIE_NAME, path="/")
    return {"ok": True}


@app.get("/api/auth/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return UserOut(id=user.id, email=user.email)


# --------------------------------------------------------------------------
# AI import (session required)
# --------------------------------------------------------------------------
@app.post("/api/import")
async def import_details(
    prompt: str = Form(""),
    deadline: str = Form(""),
    calendars: List[str] = Form(default=[]),
    files: List[UploadFile] = File(default=[]),
    user: User = Depends(current_user),
):
    """Turn an instruction + uploaded files into tasks + events to schedule.

    Requires a session (protects the AI key from anonymous use). Returns
    {note, tasks, events, source}.
    """
    uploaded = [((f.filename or "file"), await f.read(), (f.content_type or "")) for f in files]
    try:
        result, source = import_plan(prompt, uploaded, deadline or None, calendars)
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
# State persistence — the frontend syncs its whole workspace here.
# Scoped to the signed-in user. camelCase to match the frontend store.
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
def get_state(user: User = Depends(current_user)):
    with SessionLocal() as s:
        calendars = [
            CalendarM(id=c.id, name=c.name, color=c.color, visible=c.visible)
            for c in s.query(CalRow).filter(CalRow.user_id == user.id).all()
        ]
        events = [
            EventM(
                id=e.id, calendarId=e.calendar_id, title=e.title, date=e.date,
                start=e.start, end=e.end, kind=e.kind,
                locked=e.locked or None, taskId=e.task_id,
            )
            for e in s.query(EvRow).filter(EvRow.user_id == user.id).all()
        ]
        tasks = [
            TaskM(
                id=t.id, calendarId=t.calendar_id, title=t.title, dueDate=t.due_date,
                effortHours=t.effort_hours, priority=t.priority, done=t.done or None,
            )
            for t in s.query(TaskRow).filter(TaskRow.user_id == user.id).all()
        ]
        row = s.query(SettingsRow).filter(SettingsRow.user_id == user.id).first()
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
def put_state(state: StateM, user: User = Depends(current_user)):
    """Replace this user's whole workspace (transactional, scoped by user_id)."""
    with SessionLocal() as s:
        s.query(EvRow).filter(EvRow.user_id == user.id).delete()
        s.query(TaskRow).filter(TaskRow.user_id == user.id).delete()
        s.query(CalRow).filter(CalRow.user_id == user.id).delete()
        s.query(SettingsRow).filter(SettingsRow.user_id == user.id).delete()

        for c in state.calendars:
            s.add(CalRow(id=c.id, user_id=user.id, name=c.name, color=c.color, visible=c.visible))
        for e in state.events:
            s.add(EvRow(
                id=e.id, user_id=user.id, calendar_id=e.calendarId, title=e.title, date=e.date,
                start=e.start, end=e.end, kind=e.kind,
                locked=bool(e.locked), task_id=e.taskId,
            ))
        for t in state.tasks:
            s.add(TaskRow(
                id=t.id, user_id=user.id, calendar_id=t.calendarId, title=t.title, due_date=t.dueDate,
                effort_hours=t.effortHours, priority=t.priority, done=bool(t.done),
            ))
        g = state.settings
        s.add(SettingsRow(
            user_id=user.id, work_day_start=g.workDayStart, work_day_end=g.workDayEnd,
            max_focus_hours=g.maxFocusHours, max_work_hours_per_day=g.maxWorkHoursPerDay,
            include_weekends=g.includeWeekends, break_enabled=g.breakEnabled,
            break_start=g.breakStart, break_end=g.breakEnd,
        ))
        s.commit()
    return {"ok": True}
