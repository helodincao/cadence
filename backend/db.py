"""SQLite persistence for Cadence (single-user, no auth yet).

One workspace, four tables. The frontend syncs its whole state via
GET/PUT /api/state; this module owns the schema and session factory.
"""

from typing import Optional

from sqlalchemy import Boolean, Float, String, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

engine = create_engine("sqlite:///cadence.db", echo=False)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class Calendar(Base):
    __tablename__ = "calendars"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    color: Mapped[str] = mapped_column(String)
    visible: Mapped[bool] = mapped_column(Boolean, default=True)


class Event(Base):
    __tablename__ = "events"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    calendar_id: Mapped[str] = mapped_column(String)
    title: Mapped[str] = mapped_column(String)
    date: Mapped[str] = mapped_column(String)  # ISO YYYY-MM-DD
    start: Mapped[float] = mapped_column(Float)
    end: Mapped[float] = mapped_column(Float)
    kind: Mapped[str] = mapped_column(String)  # "fixed" | "block"
    locked: Mapped[bool] = mapped_column(Boolean, default=False)
    task_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)


class Task(Base):
    __tablename__ = "tasks"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    calendar_id: Mapped[str] = mapped_column(String)
    title: Mapped[str] = mapped_column(String)
    due_date: Mapped[str] = mapped_column(String)  # ISO YYYY-MM-DD
    effort_hours: Mapped[float] = mapped_column(Float)
    priority: Mapped[str] = mapped_column(String)  # low | med | high
    done: Mapped[bool] = mapped_column(Boolean, default=False)


class SettingsRow(Base):
    __tablename__ = "settings"
    id: Mapped[int] = mapped_column(primary_key=True, default=1)  # singleton
    work_day_start: Mapped[float] = mapped_column(Float)
    work_day_end: Mapped[float] = mapped_column(Float)
    max_focus_hours: Mapped[float] = mapped_column(Float)
    max_work_hours_per_day: Mapped[float] = mapped_column(Float)
    include_weekends: Mapped[bool] = mapped_column(Boolean)
    break_enabled: Mapped[bool] = mapped_column(Boolean)
    break_start: Mapped[float] = mapped_column(Float)
    break_end: Mapped[float] = mapped_column(Float)


def init_db() -> None:
    Base.metadata.create_all(engine)
