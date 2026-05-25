"""Database engine + session management (SQLAlchemy 2.0)."""
from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import settings

connect_args = {"check_same_thread": False} if settings.DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(settings.DATABASE_URL, connect_args=connect_args, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _ensure_sqlite_columns() -> None:
    """Add new columns to existing SQLite tables (create_all won't ALTER existing ones).

    Idempotent, lightweight migration for the dev SQLite DB. For Postgres, use real migrations.
    """
    if not settings.DATABASE_URL.startswith("sqlite"):
        return
    from sqlalchemy import text

    additions = {
        "candidates": [
            ("resume_filename", "VARCHAR DEFAULT ''"),
            ("resume_mime", "VARCHAR DEFAULT ''"),
            ("resume_file", "BLOB"),
        ],
        "jobs": [
            ("target_platforms", "TEXT DEFAULT '[]'"),
            ("video_questions", "TEXT DEFAULT '[]'"),
        ],
        "video_interviews": [
            ("transcript", "TEXT DEFAULT ''"),
            ("timeline", "TEXT DEFAULT '[]'"),
            ("proctoring", "TEXT DEFAULT '{}'"),
            ("recording", "BLOB"),
            ("recording_mime", "VARCHAR DEFAULT 'video/webm'"),
            ("duration", "FLOAT DEFAULT 0"),
        ],
    }
    with engine.begin() as conn:
        for table, cols in additions.items():
            existing = {row[1] for row in conn.execute(text(f"PRAGMA table_info({table})"))}
            for name, decl in cols:
                if name not in existing:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {decl}"))


def _ensure_pg_columns() -> None:
    """Add new columns to existing Postgres tables (create_all won't ALTER them).

    Postgres supports ADD COLUMN IF NOT EXISTS, so this is idempotent. Needed because the
    deployed jobs table predates `target_platforms`.
    """
    if settings.DATABASE_URL.startswith("sqlite"):
        return
    from sqlalchemy import text

    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS target_platforms JSONB DEFAULT '[]'::jsonb"))
        conn.execute(text("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS video_questions JSONB DEFAULT '[]'::jsonb"))
        for stmt in (
            "ALTER TABLE video_interviews ADD COLUMN IF NOT EXISTS transcript TEXT DEFAULT ''",
            "ALTER TABLE video_interviews ADD COLUMN IF NOT EXISTS timeline JSONB DEFAULT '[]'::jsonb",
            "ALTER TABLE video_interviews ADD COLUMN IF NOT EXISTS proctoring JSONB DEFAULT '{}'::jsonb",
            "ALTER TABLE video_interviews ADD COLUMN IF NOT EXISTS recording BYTEA",
            "ALTER TABLE video_interviews ADD COLUMN IF NOT EXISTS recording_mime VARCHAR DEFAULT 'video/webm'",
            "ALTER TABLE video_interviews ADD COLUMN IF NOT EXISTS duration DOUBLE PRECISION DEFAULT 0",
        ):
            conn.execute(text(stmt))


def init_db() -> None:
    # Import models so they register on Base before create_all.
    from . import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _ensure_sqlite_columns()
    _ensure_pg_columns()
