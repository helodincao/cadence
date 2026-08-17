"""Turn a user's request + attached files into a study/work plan.

Two paths:
  * AI path (ANTHROPIC_API_KEY set): the Anthropic SDK reads the instruction and
    any attached files (PDF/image/text) and returns structured tasks + events.
  * Heuristic path (no key): a small regex pass over the instruction text, so the
    feature still runs and is testable without a key (files are ignored).

Tasks are work that needs time allocated (the scheduler places blocks for them);
events are fixed-time things (exams, quizzes, presentations, class sessions).
"""

import base64
import os
import re
from typing import List, Literal, Optional, Tuple

from pydantic import BaseModel

# Default to the strongest model per Anthropic guidance; override with
# CADENCE_MODEL=claude-haiku-4-5 (or sonnet) to cut cost.
MODEL = os.environ.get("CADENCE_MODEL", "claude-opus-5")

Priority = Literal["low", "med", "high"]

# A file the frontend uploaded: (filename, raw bytes, content_type).
UploadedFile = Tuple[str, bytes, str]


class ImTask(BaseModel):
    title: str
    due_date: Optional[str] = None  # ISO YYYY-MM-DD
    effort_hours: float
    priority: Priority


class ImEvent(BaseModel):
    title: str
    date: str  # ISO YYYY-MM-DD
    start: float  # decimal 24h hour
    end: float


class ImportResult(BaseModel):
    note: str
    tasks: List[ImTask]
    events: List[ImEvent]


SYSTEM_PROMPT = """You turn a user's request plus any attached files (course
syllabi, project specs) into a concrete study/work plan.

Return two lists:
- tasks: work the user must do that needs time allocated — assignments,
  projects, readings, exam prep. Each task has: title; due_date (ISO
  YYYY-MM-DD, or null if none is given); effort_hours (your estimate of TOTAL
  hours of work, judged from the complexity described or implied — a number);
  priority ("high" for exams/projects/finals, "med" for assignments/labs/quizzes,
  "low" for readings and small tasks).
- events: things that happen at a fixed time — exams, quizzes, presentations,
  scheduled class sessions. Each has: title; date (ISO); start and end as
  decimal 24-hour hours (e.g. 14.5 = 2:30 PM). If no time is given, use 9.0–10.0.

Also return note: one short sentence summarizing what you planned.

Follow the user's instruction:
- If they describe ONE project/assignment with a due date, create a single task
  and estimate its effort_hours from the complexity.
- If they attach a syllabus and ask to schedule everything, extract every graded
  assignment as a task (with its due date and an effort estimate), and every
  exam/quiz/presentation as an event on its date (add a separate exam-prep task
  when studying is implied).

Only include real, dated work. Ignore policies, office hours, and boilerplate."""


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
        }
        for t in tasks
    ]


def _events_to_api(events: List[ImEvent]) -> List[dict]:
    out = []
    for e in events:
        start = max(8.0, min(20.5, round(e.start * 2) / 2))
        end = max(start + 0.5, min(21.0, round(e.end * 2) / 2))
        out.append({"title": e.title.strip() or "Untitled", "date": e.date, "start": start, "end": end})
    return out


# ---------------------------------------------------------------------------
# AI path
# ---------------------------------------------------------------------------
def _import_with_ai(
    prompt: str, files: List[UploadedFile], deadline: Optional[str] = None
) -> Optional[ImportResult]:
    import datetime

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
    content.append({"type": "text", "text": instruction})

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
        tasks.append(ImTask(title=title, due_date=deadline, effort_hours=_EFFORT[priority], priority=priority))
    # If a deadline was given but nothing matched, still make one prep task so
    # the "plan work sessions for this event" flow always produces something.
    if deadline and not tasks:
        snippet = " ".join(text.split())[:57]
        title = ("Prep: " + snippet) if snippet else "Prep work"
        tasks.append(ImTask(title=title, due_date=deadline, effort_hours=_EFFORT["med"], priority="med"))
    return tasks


def import_plan(prompt: str, files: List[UploadedFile], deadline: Optional[str] = None):
    """Return (result_dict, source) where source is 'ai' or 'heuristic'.

    When ``deadline`` (ISO YYYY-MM-DD) is given, the plan is framed as work
    leading up to that date — used by the "plan work sessions for this event"
    flow in the event editor.
    """
    if not os.environ.get("ANTHROPIC_API_KEY"):
        text = prompt
        for name, data, mt in files:
            if not mt.startswith("image/") and mt != "application/pdf":
                text += "\n" + data.decode("utf-8", errors="ignore")
        note = "AI is off (no ANTHROPIC_API_KEY on the backend) — parsed the text with a simple rules pass; any PDF/image files were skipped."
        return {"note": note, "tasks": _tasks_to_api(_heuristic(text, deadline)), "events": []}, "heuristic"

    result = _import_with_ai(prompt, files, deadline)
    if not result:
        return {"note": "Nothing to schedule was found.", "tasks": [], "events": []}, "ai"
    return {
        "note": result.note,
        "tasks": _tasks_to_api(result.tasks),
        "events": _events_to_api(result.events),
    }, "ai"
