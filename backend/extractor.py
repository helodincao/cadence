"""Syllabus -> tasks extraction.

Two paths:
  * AI path (when ANTHROPIC_API_KEY is set): the Anthropic SDK with structured
    outputs pulls graded deliverables out of pasted syllabus text.
  * Heuristic path (no key): a small regex pass, so the whole feature still
    runs and is testable without an API key. Clearly flagged in the response.

The scheduler/front-end model uses a weekday index (0 = Mon … 6 = Sun) for a
task's due day, so we convert any ISO date the model returns into that index.
"""

import os
import re
from typing import List, Literal, Optional

from pydantic import BaseModel

# Default to the strongest model per Anthropic guidance; override with
# CADENCE_MODEL=claude-haiku-4-5 (or sonnet) to cut cost for this simple task.
MODEL = os.environ.get("CADENCE_MODEL", "claude-opus-5")

Priority = Literal["low", "med", "high"]


class ExtractedTask(BaseModel):
    """One graded deliverable, as returned by the model or the heuristic."""

    title: str
    due_date: Optional[str] = None  # ISO YYYY-MM-DD, or null if unknown
    effort_hours: float
    priority: Priority


class Extraction(BaseModel):
    tasks: List[ExtractedTask]


SYSTEM_PROMPT = """You extract graded deliverables from a university course syllabus.

Return every assignment, problem set, reading, quiz, exam, project, paper, or
lab that a student must complete. For each one:
- title: a short, specific name (e.g. "Problem Set 4", "Midterm Exam", "Read Ch. 7").
- due_date: the due date as ISO YYYY-MM-DD if a concrete date is given, else null.
- effort_hours: a rough estimate of hours of work (readings ~1-2, problem sets
  ~3-6, projects ~6-12, exams ~4-8 of study). A number, not a range.
- priority: "high" for exams/projects/finals, "med" for assignments/problem
  sets/labs, "low" for readings and small tasks.

Only include real graded or required work. Ignore office hours, policies, and
administrative text."""


def _to_api(tasks: List[ExtractedTask]) -> List[dict]:
    """Shape tasks the way the front-end store expects.

    dueDate is the ISO date the model resolved (or null); the front-end fills a
    default when it's null (the heuristic path can't resolve dates)."""
    return [
        {
            "title": t.title.strip() or "Untitled task",
            "dueDate": t.due_date,
            "dueDateText": t.due_date,
            "effortHours": max(0.5, round(float(t.effort_hours) * 2) / 2),
            "priority": t.priority,
        }
        for t in tasks
    ]


# ---------------------------------------------------------------------------
# AI path
# ---------------------------------------------------------------------------
def _extract_with_ai(text: str) -> List[ExtractedTask]:
    import datetime

    import anthropic  # imported lazily so the heuristic path needs no SDK

    today = datetime.date.today().isoformat()
    system = (
        SYSTEM_PROMPT
        + f"\n\nToday's date is {today}. Resolve relative or year-less dates "
        "(e.g. '9/19', 'next Friday') to the correct upcoming ISO date."
    )

    client = anthropic.Anthropic()
    response = client.messages.parse(
        model=MODEL,
        max_tokens=4096,
        system=system,
        messages=[{"role": "user", "content": text}],
        output_format=Extraction,
    )
    parsed = response.parsed_output
    return parsed.tasks if parsed else []


# ---------------------------------------------------------------------------
# Heuristic fallback (no API key)
# ---------------------------------------------------------------------------
_KEYWORDS = {
    "high": ("exam", "midterm", "final", "project", "presentation"),
    "med": ("assignment", "homework", "problem set", "pset", "hw", "lab", "quiz", "paper", "due"),
    "low": ("reading", "read", "chapter", "watch"),
}
# Word-boundary matchers so "lab" doesn't match "sy(llab)us", etc.
_KEYWORD_RE = {
    level: re.compile(r"\b(?:" + "|".join(re.escape(k) for k in words) + r")\b", re.I)
    for level, words in _KEYWORDS.items()
}
_EFFORT = {"high": 6.0, "med": 3.0, "low": 1.5}
_DATE_RE = re.compile(
    r"\b(\d{1,2}/\d{1,2}(?:/\d{2,4})?)"
    r"|((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2})\b",
    re.IGNORECASE,
)


def _heuristic(text: str) -> List[ExtractedTask]:
    tasks: List[ExtractedTask] = []
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
        date_match = _DATE_RE.search(line)
        title = line if len(line) <= 60 else line[:57] + "…"
        tasks.append(
            ExtractedTask(
                title=title,
                due_date=None,  # heuristic doesn't resolve dates to ISO
                effort_hours=_EFFORT[priority],
                priority=priority,
            )
        )
        # Keep the raw date text visible even though we can't map it to a weekday.
        if date_match:
            tasks[-1].due_date = None
    return tasks


def extract_tasks(text: str):
    """Return (tasks, source) where source is 'ai' or 'heuristic'."""
    if not os.environ.get("ANTHROPIC_API_KEY"):
        return _to_api(_heuristic(text)), "heuristic"
    return _to_api(_extract_with_ai(text)), "ai"
