"""Turn a user's request + attached files into a study/work plan.

Three paths, chosen by which API key is present (see ``active_provider``):
  * Anthropic (ANTHROPIC_API_KEY): the Anthropic SDK reads the instruction and
    any attached files (PDF/image/text) and returns structured tasks + events.
  * Gemini (GEMINI_API_KEY / GOOGLE_API_KEY): Google's free-tier-friendly models,
    also multimodal — reads PDFs and images natively. Same structured output.
  * Heuristic (no key): a small regex pass over the instruction text, so the
    feature still runs and is testable without a key (files are ignored).

Force one with CADENCE_PROVIDER=anthropic|gemini; otherwise the first provider
with a key wins (Anthropic preferred for quality). Tasks are work that needs
time allocated (the scheduler places blocks for them); events are fixed-time
things (exams, quizzes, presentations, class sessions).
"""

import base64
import datetime
import os
import re
import time
from typing import List, Literal, Optional, Tuple

from pydantic import BaseModel

# Anthropic model — strongest by default; CADENCE_MODEL=claude-sonnet-5 to cut cost.
MODEL = os.environ.get("CADENCE_MODEL", "claude-opus-5")
# Gemini model — a fast, free-tier-friendly default; override with CADENCE_GEMINI_MODEL.
GEMINI_MODEL = os.environ.get("CADENCE_GEMINI_MODEL", "gemini-3.6-flash")

Priority = Literal["low", "med", "high"]


def _gemini_key() -> Optional[str]:
    return os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")


def active_provider() -> str:
    """Which backend actually runs: 'anthropic', 'gemini', or 'none' (heuristic).

    CADENCE_PROVIDER forces a choice (falling back to 'none' if that provider has
    no key). Unset, the first provider with a key wins, Anthropic first.
    """
    choice = os.environ.get("CADENCE_PROVIDER", "").strip().lower()
    if choice == "anthropic":
        return "anthropic" if os.environ.get("ANTHROPIC_API_KEY") else "none"
    if choice == "gemini":
        return "gemini" if _gemini_key() else "none"
    if os.environ.get("ANTHROPIC_API_KEY"):
        return "anthropic"
    if _gemini_key():
        return "gemini"
    return "none"


def active_model() -> Optional[str]:
    """The model id that will be used, or None on the heuristic path."""
    prov = active_provider()
    return {"anthropic": MODEL, "gemini": GEMINI_MODEL}.get(prov)

# A file the frontend uploaded: (filename, raw bytes, content_type).
UploadedFile = Tuple[str, bytes, str]


class ImTask(BaseModel):
    title: str
    due_date: Optional[str] = None  # ISO YYYY-MM-DD
    effort_hours: float
    priority: Priority
    group: str = "Tasks"  # inferred category, e.g. "Exams", "Assignments"


class ImEvent(BaseModel):
    title: str
    date: str  # ISO YYYY-MM-DD
    start: float  # decimal 24h hour
    end: float
    group: str = "Events"  # inferred category, e.g. "Lectures", "Office Hours"


class ImportResult(BaseModel):
    note: str
    tasks: List[ImTask]
    events: List[ImEvent]


SYSTEM_PROMPT = """You turn a user's request plus any attached files (course
syllabi, project specs, schedules) into a concrete study/work plan.

Return two lists:
- tasks: work the user must do that needs time allocated — assignments,
  projects, readings, exam prep. Each task has: title; due_date (ISO
  YYYY-MM-DD, or null if none is given); effort_hours (your estimate of TOTAL
  hours of work, judged from the complexity described or implied — a number);
  priority ("high" for exams/projects/finals, "med" for assignments/labs/quizzes,
  "low" for readings and small tasks); group (see below).
- events: things that happen at a fixed time — exams, quizzes, presentations,
  lectures/class sessions, office hours, meetings. Each has: title; date (ISO);
  start and end as decimal 24-hour hours (e.g. 14.5 = 2:30 PM; if no time is
  given, use 9.0–10.0); group (see below).

group: a short category label that buckets similar items together, so the user
can file each bucket into its own calendar. Use the SAME EXACT label for every
item of a kind — e.g. all midterms/finals/exams -> "Exams"; all office hours ->
"Office Hours"; all lectures/class sessions -> "Lectures"; assignments/problem
sets/homework -> "Assignments"; readings -> "Readings"; a big project's pieces ->
its project name. Infer sensible, general categories from the content — this is
NOT limited to school (it could be "Meetings", "Shifts", "Deadlines", etc.).

DEADLINES ARE TASKS, NOT EVENTS. Anything that is "due" on a date — an
assignment, problem set, project, paper, report, or any deliverable with a
deadline but no fixed meeting time — must be a TASK with that date as its
due_date, so the user can allot work time toward it. Make an EVENT only when
there is a real time to be present: a lecture, an exam sitting, an in-class
quiz, a presentation slot, office hours, or a meeting. When unsure whether
something is a deadline or an event, prefer a task.

Also return note: one short sentence summarizing what you planned.

Follow the user's instruction:
- If they describe ONE project/assignment with a due date, create a single task
  and estimate its effort_hours from the complexity.
- If they attach a syllabus/schedule and ask to schedule everything, extract
  every graded assignment as a task (with its due date and effort estimate),
  every exam/quiz/presentation as an event, and every recurring session (lecture,
  office hours) as an event; add a separate exam-prep task when studying is
  implied.

Only include real, dated/timed items. Ignore prose policies and boilerplate."""


def _snap(hours: float) -> float:
    return max(0.5, round(float(hours) * 2) / 2)


def _tasks_to_api(tasks: List[ImTask]) -> List[dict]:
    return [
        {
            "title": t.title.strip() or "Untitled task",
            "dueDate": t.due_date,
            "dueDateText": t.due_date,
            "effortHours": _snap(t.effort_hours),
            "priority": t.priority,
            "group": (t.group or "Tasks").strip() or "Tasks",
        }
        for t in tasks
    ]


def _snap5(hour: float) -> float:
    return round(hour * 12) / 12  # nearest 5 minutes


def _events_to_api(events: List[ImEvent]) -> List[dict]:
    out = []
    for e in events:
        start = max(8.0, min(20.0 + 55 / 60, _snap5(e.start)))
        end = max(start + 1 / 12, min(21.0, _snap5(e.end)))
        out.append({
            "title": e.title.strip() or "Untitled",
            "date": e.date,
            "start": start,
            "end": end,
            "group": (e.group or "Events").strip() or "Events",
        })
    return out


# ---------------------------------------------------------------------------
# Shared instruction text (provider-agnostic)
# ---------------------------------------------------------------------------
def _build_instruction(
    prompt: str, text_snippets: List[str], deadline: Optional[str]
) -> str:
    today = datetime.date.today().isoformat()
    instruction = prompt.strip() or "Plan the attached work."
    if text_snippets:
        instruction += "\n\nAttached text files:\n" + "\n\n".join(text_snippets)
    instruction += (
        f"\n\nToday's date is {today}. Resolve any relative or year-less dates "
        "to the correct upcoming ISO date."
    )
    if deadline:
        instruction += (
            f"\n\nAll of this work leads up to a deadline on {deadline}. Break it "
            "into work/preparation sessions that finish on or before that date. "
            "Every task's due_date must be on or before {d}; if a task has no "
            "explicit date, set its due_date to {d}. Return only tasks (no events) "
            "unless the files clearly describe additional fixed-time exams or "
            "sessions.".format(d=deadline)
        )
    return instruction


# ---------------------------------------------------------------------------
# Anthropic path
# ---------------------------------------------------------------------------
def _import_with_ai(
    prompt: str, files: List[UploadedFile], deadline: Optional[str] = None
) -> Optional[ImportResult]:
    import anthropic  # imported lazily so the heuristic path needs no SDK

    content: list = []
    text_snippets: list[str] = []
    for name, data, mt in files:
        if mt == "application/pdf":
            content.append({
                "type": "document",
                "source": {
                    "type": "base64",
                    "media_type": "application/pdf",
                    "data": base64.standard_b64encode(data).decode(),
                },
            })
        elif mt.startswith("image/"):
            content.append({
                "type": "image",
                "source": {"type": "base64", "media_type": mt, "data": base64.standard_b64encode(data).decode()},
            })
        else:
            text_snippets.append(f"----- FILE: {name} -----\n{data.decode('utf-8', errors='ignore')}")

    content.append({"type": "text", "text": _build_instruction(prompt, text_snippets, deadline)})

    client = anthropic.Anthropic()
    response = client.messages.parse(
        model=MODEL,
        max_tokens=8192,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": content}],
        output_format=ImportResult,
    )
    return response.parsed_output


# ---------------------------------------------------------------------------
# Gemini path (Google's free tier; multimodal)
# ---------------------------------------------------------------------------
def _import_with_gemini(
    prompt: str, files: List[UploadedFile], deadline: Optional[str] = None
) -> Optional[ImportResult]:
    from google import genai  # imported lazily so other paths need no SDK
    from google.genai import errors, types

    parts: list = []
    text_snippets: list[str] = []
    for name, data, mt in files:
        if mt == "application/pdf" or mt.startswith("image/"):
            parts.append(types.Part.from_bytes(data=data, mime_type=mt))
        else:
            text_snippets.append(f"----- FILE: {name} -----\n{data.decode('utf-8', errors='ignore')}")

    parts.append(types.Part.from_text(text=_build_instruction(prompt, text_snippets, deadline)))

    client = genai.Client(api_key=_gemini_key())
    config = types.GenerateContentConfig(
        system_instruction=SYSTEM_PROMPT,
        response_mime_type="application/json",
        response_schema=ImportResult,
    )
    # The free tier throws transient 5xx "high demand" errors — retry a few times.
    last_err: Optional[Exception] = None
    for attempt in range(3):
        try:
            response = client.models.generate_content(
                model=GEMINI_MODEL, contents=parts, config=config
            )
            return response.parsed
        except errors.ServerError as e:
            last_err = e
            time.sleep(2 * (attempt + 1))
    raise last_err  # exhausted retries; surfaced as a clean error by the endpoint


# ---------------------------------------------------------------------------
# Heuristic fallback (no API key) — instruction text only
# ---------------------------------------------------------------------------
_KEYWORDS = {
    "high": ("exam", "midterm", "final", "project", "presentation"),
    "med": ("assignment", "homework", "problem set", "pset", "hw", "lab", "quiz", "paper", "due"),
    "low": ("reading", "read", "chapter", "watch"),
}
_KEYWORD_RE = {
    level: re.compile(r"\b(?:" + "|".join(re.escape(k) for k in words) + r")\b", re.I)
    for level, words in _KEYWORDS.items()
}
_EFFORT = {"high": 6.0, "med": 3.0, "low": 1.5}

# Keyword → group category (checked in order), for the no-key heuristic path.
_GROUPS = (
    ("Exams", ("exam", "midterm", "final", "test", "quiz")),
    ("Projects", ("project", "presentation")),
    ("Assignments", ("assignment", "homework", "problem set", "pset", "hw", "lab", "paper", "essay")),
    ("Readings", ("reading", "read", "chapter", "watch")),
)
_GROUP_RE = [
    (name, re.compile(r"\b(?:" + "|".join(re.escape(k) for k in words) + r")\b", re.I))
    for name, words in _GROUPS
]


def _group_for(line: str) -> str:
    for name, rx in _GROUP_RE:
        if rx.search(line):
            return name
    return "Tasks"


def _heuristic(text: str, deadline: Optional[str] = None) -> List[ImTask]:
    tasks: List[ImTask] = []
    for raw in text.splitlines():
        line = raw.strip()
        if len(line) < 4:
            continue
        priority: Optional[Priority] = None
        for level in ("high", "med", "low"):
            if _KEYWORD_RE[level].search(line):
                priority = level  # type: ignore[assignment]
                break
        if priority is None:
            continue
        title = line if len(line) <= 60 else line[:57] + "…"
        tasks.append(ImTask(
            title=title, due_date=deadline, effort_hours=_EFFORT[priority],
            priority=priority, group=_group_for(line),
        ))
    # If a deadline was given but nothing matched, still make one prep task so
    # the "plan work sessions for this event" flow always produces something.
    if deadline and not tasks:
        snippet = " ".join(text.split())[:57]
        title = ("Prep: " + snippet) if snippet else "Prep work"
        tasks.append(ImTask(title=title, due_date=deadline, effort_hours=_EFFORT["med"], priority="med", group="Tasks"))
    return tasks


def import_plan(prompt: str, files: List[UploadedFile], deadline: Optional[str] = None):
    """Return (result_dict, source) where source is 'ai' or 'heuristic'.

    When ``deadline`` (ISO YYYY-MM-DD) is given, the plan is framed as work
    leading up to that date — used by the "plan work sessions for this event"
    flow in the event editor.
    """
    provider = active_provider()

    if provider == "none":
        text = prompt
        for name, data, mt in files:
            if not mt.startswith("image/") and mt != "application/pdf":
                text += "\n" + data.decode("utf-8", errors="ignore")
        note = (
            "AI is off (no ANTHROPIC_API_KEY or GEMINI_API_KEY on the backend) — "
            "parsed the text with a simple rules pass; any PDF/image files were skipped."
        )
        return {"note": note, "tasks": _tasks_to_api(_heuristic(text, deadline)), "events": []}, "heuristic"

    result = (
        _import_with_gemini(prompt, files, deadline)
        if provider == "gemini"
        else _import_with_ai(prompt, files, deadline)
    )
    if not result:
        return {"note": "Nothing to schedule was found.", "tasks": [], "events": []}, "ai"
    return {
        "note": result.note,
        "tasks": _tasks_to_api(result.tasks),
        "events": _events_to_api(result.events),
    }, "ai"
