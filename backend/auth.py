"""Authentication for Cadence: password hashing, server-side sessions, and the
`current_user` FastAPI dependency.

Sessions are opaque random tokens stored in the DB and carried in an httpOnly
cookie, so the token is never exposed to JavaScript (XSS-resistant).
"""

import datetime
import secrets
from typing import Optional

import bcrypt
from fastapi import Cookie, HTTPException, status

from db import SessionLocal, Session as SessionRow, User

COOKIE_NAME = "cadence_session"
SESSION_DAYS = 30
# bcrypt only uses the first 72 bytes; enforce a sane range at signup instead.
MIN_PASSWORD_LEN = 8
MAX_PASSWORD_LEN = 72


def _now() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("ascii")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("ascii"))
    except (ValueError, TypeError):
        return False


def create_session(user_id: str) -> str:
    token = secrets.token_urlsafe(32)
    now = _now()
    with SessionLocal() as s:
        s.add(
            SessionRow(
                token=token,
                user_id=user_id,
                created_at=now.isoformat(),
                expires_at=(now + datetime.timedelta(days=SESSION_DAYS)).isoformat(),
            )
        )
        s.commit()
    return token


def delete_session(token: str) -> None:
    with SessionLocal() as s:
        row = s.get(SessionRow, token)
        if row:
            s.delete(row)
            s.commit()


def current_user(cadence_session: Optional[str] = Cookie(default=None)) -> User:
    """Resolve the signed-in user from the session cookie, or 401.

    Use as a dependency:  `user: User = Depends(current_user)`.
    """
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED, detail="Not signed in"
    )
    if not cadence_session:
        raise unauthorized
    with SessionLocal() as s:
        row = s.get(SessionRow, cadence_session)
        if row is None:
            raise unauthorized
        if row.expires_at < _now().isoformat():
            s.delete(row)
            s.commit()
            raise unauthorized
        user = s.get(User, row.user_id)
        if user is None:
            raise unauthorized
        return user
