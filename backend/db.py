"""SQLite persistence for Cadence.

Per-user workspaces: `users` + `sessions` for auth, and four data tables
(calendars, events, tasks, settings) scoped by `user_id`. The frontend syncs its
whole workspace via GET/PUT /api/state; this module owns the schema.

Existing single-user databases are migrated in place: a `user_id` column is added
to the data tables (rows keep NULL until the first account adopts them).
"""

from typing import Optional

from sqlalchemy import Boolean, Float, String, create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

engine = create_engine("sqlite:///cadence.db", echo=False)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    email: Mapped[str] = mapped_column(String, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String)
    created_at: Mapped[str] = mapped_column(String)  # ISO datetime


class Session(Base):
    __tablename__ = "sessions"
    token: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(String, index=True)
    created_at: Mapped[str] = mapped_column(String)
    expires_at: Mapped[str] = mapped_column(String)  # ISO datetime


class Calendar(Base):
    __tablename__ = "calendars"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[Optional[str]] = mapped_column(String, index=True, nullable=True)
    name: Mapped[str] = mapped_column(String)
    color: Mapped[str] = mapped_column(String)
    visible: Mapped[bool] = mapped_column(Boolean, default=True)


class Event(Base):
    __tablename__ = "events"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[Optional[str]] = mapped_column(String, index=True, nullable=True)
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
    user_id: Mapped[Optional[str]] = mapped_column(String, index=True, nullable=True)
    calendar_id: Mapped[str] = mapped_column(String)
    title: Mapped[str] = mapped_column(String)
    due_date: Mapped[str] = mapped_column(String)  # ISO YYYY-MM-DD
    effort_hours: Mapped[float] = mapped_column(Float)
    priority: Mapped[str] = mapped_column(String)  # low | med | high
    done: Mapped[bool] = mapped_column(Boolean, default=False)


class SettingsRow(Base):
    __tablename__ = "settings"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[Optional[str]] = mapped_column(String, unique=True, index=True, nullable=True)
    work_day_start: Mapped[float] = mapped_column(Float)
    work_day_end: Mapped[float] = mapped_column(Float)
    max_focus_hours: Mapped[float] = mapped_column(Float)
    max_work_hours_per_day: Mapped[float] = mapped_column(Float)
    include_weekends: Mapped[bool] = mapped_column(Boolean)
    break_enabled: Mapped[bool] = mapped_column(Boolean)
    break_start: Mapped[float] = mapped_column(Float)
    break_end: Mapped[float] = mapped_column(Float)


def _migrate_add_user_id() -> None:
    """Add a `user_id` column to pre-auth data tables that predate it."""
    insp = inspect(engine)
    existing = set(insp.get_table_names())
    with engine.begin() as conn:
        for tbl in ("calendars", "events", "tasks", "settings"):
            if tbl not in existing:
                continue
            cols = {c["name"] for c in insp.get_columns(tbl)}
            if "user_id" not in cols:
                conn.execute(text(f"ALTER TABLE {tbl} ADD COLUMN user_id VARCHAR"))


def init_db() -> None:
    Base.metadata.create_all(engine)
    _migrate_add_user_id()
