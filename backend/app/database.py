"""Database engine + session management (SQLAlchemy 2.0)."""
from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import settings

connect_args = {"check_same_thread": False} if settings.DATABASE_URL.startswith("sqlite") else {}
_engine_kwargs: dict = {"future": True, "connect_args": connect_args}
if not settings.DATABASE_URL.startswith("sqlite"):
    # Free/hosted Postgres drops idle connections; pre-ping + recycle avoid stale-conn errors.
    _engine_kwargs.update(pool_pre_ping=True, pool_recycle=1800, pool_size=5, max_overflow=10)
engine = create_engine(settings.DATABASE_URL, **_engine_kwargs)
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
            ("distribution", "TEXT DEFAULT '{}'"),
        ],
        "hiring_requests": [
            ("start_hiring_date", "VARCHAR DEFAULT ''"),
            ("application_questions", "TEXT DEFAULT '[]'"),
            ("interview_types", "TEXT DEFAULT '[]'"),
            ("hiring_manager", "VARCHAR DEFAULT ''"),
            ("recruiter", "VARCHAR DEFAULT ''"),
            ("status_changed_at", "DATETIME"),
            ("role_brief", "TEXT DEFAULT ''"),
        ],
        "applications": [
            ("score_breakdown", "TEXT DEFAULT '{}'"),
            ("application_answers", "TEXT DEFAULT '[]'"),
            ("applied_by", "VARCHAR DEFAULT ''"),
        ],
        "video_interviews": [
            ("transcript", "TEXT DEFAULT ''"),
            ("timeline", "TEXT DEFAULT '[]'"),
            ("proctoring", "TEXT DEFAULT '{}'"),
            ("recording", "BLOB"),
            ("recording_mime", "VARCHAR DEFAULT 'video/webm'"),
            ("duration", "FLOAT DEFAULT 0"),
            ("evaluation", "TEXT DEFAULT '{}'"),
        ],
        "screening_interviews": [
            ("per_question", "TEXT DEFAULT '[]'"),
        ],
        "interview_rounds": [
            ("assessment_id", "INTEGER"),
            ("panel_feedback", "TEXT DEFAULT '[]'"),
        ],
        "documents": [
            ("template_key", "VARCHAR DEFAULT ''"),
            ("blocks", "TEXT DEFAULT '[]'"),
            ("upload_filename", "VARCHAR DEFAULT ''"),
            ("upload_mime", "VARCHAR DEFAULT ''"),
            ("upload_size", "INTEGER DEFAULT 0"),
            ("upload_file", "BLOB"),
            ("move_to_onboarding", "BOOLEAN DEFAULT 0"),
            ("personal_email", "VARCHAR DEFAULT ''"),
        ],
        "assessments": [
            ("team", "VARCHAR DEFAULT ''"),
            ("department", "VARCHAR DEFAULT ''"),
            ("role", "VARCHAR DEFAULT ''"),
        ],
        "onboarding_plans": [
            ("details", "TEXT DEFAULT '{}'"),
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
        conn.execute(text("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS distribution JSONB DEFAULT '{}'::jsonb"))
        conn.execute(text("ALTER TABLE applications ADD COLUMN IF NOT EXISTS score_breakdown JSONB DEFAULT '{}'::jsonb"))
        for stmt in (
            "ALTER TABLE hiring_requests ADD COLUMN IF NOT EXISTS start_hiring_date VARCHAR DEFAULT ''",
            "ALTER TABLE hiring_requests ADD COLUMN IF NOT EXISTS application_questions JSONB DEFAULT '[]'::jsonb",
            "ALTER TABLE hiring_requests ADD COLUMN IF NOT EXISTS interview_types JSONB DEFAULT '[]'::jsonb",
            "ALTER TABLE hiring_requests ADD COLUMN IF NOT EXISTS hiring_manager VARCHAR DEFAULT ''",
            "ALTER TABLE hiring_requests ADD COLUMN IF NOT EXISTS recruiter VARCHAR DEFAULT ''",
            "ALTER TABLE applications ADD COLUMN IF NOT EXISTS application_answers JSONB DEFAULT '[]'::jsonb",
            "ALTER TABLE applications ADD COLUMN IF NOT EXISTS applied_by VARCHAR DEFAULT ''",
            "ALTER TABLE documents ADD COLUMN IF NOT EXISTS upload_filename VARCHAR DEFAULT ''",
            "ALTER TABLE documents ADD COLUMN IF NOT EXISTS upload_mime VARCHAR DEFAULT ''",
            "ALTER TABLE documents ADD COLUMN IF NOT EXISTS upload_size INTEGER DEFAULT 0",
            "ALTER TABLE documents ADD COLUMN IF NOT EXISTS upload_file BYTEA",
            "ALTER TABLE documents ADD COLUMN IF NOT EXISTS move_to_onboarding BOOLEAN DEFAULT FALSE",
            "ALTER TABLE video_interviews ADD COLUMN IF NOT EXISTS transcript TEXT DEFAULT ''",
            "ALTER TABLE video_interviews ADD COLUMN IF NOT EXISTS timeline JSONB DEFAULT '[]'::jsonb",
            "ALTER TABLE video_interviews ADD COLUMN IF NOT EXISTS proctoring JSONB DEFAULT '{}'::jsonb",
            "ALTER TABLE video_interviews ADD COLUMN IF NOT EXISTS recording BYTEA",
            "ALTER TABLE video_interviews ADD COLUMN IF NOT EXISTS recording_mime VARCHAR DEFAULT 'video/webm'",
            "ALTER TABLE video_interviews ADD COLUMN IF NOT EXISTS duration DOUBLE PRECISION DEFAULT 0",
            "ALTER TABLE video_interviews ADD COLUMN IF NOT EXISTS evaluation JSONB DEFAULT '{}'::jsonb",
            "ALTER TABLE screening_interviews ADD COLUMN IF NOT EXISTS per_question JSONB DEFAULT '[]'::jsonb",
            "ALTER TABLE interview_rounds ADD COLUMN IF NOT EXISTS assessment_id INTEGER",
            "ALTER TABLE interview_rounds ADD COLUMN IF NOT EXISTS panel_feedback JSONB DEFAULT '[]'::jsonb",
            "ALTER TABLE documents ADD COLUMN IF NOT EXISTS template_key VARCHAR DEFAULT ''",
            "ALTER TABLE documents ADD COLUMN IF NOT EXISTS blocks JSONB DEFAULT '[]'::jsonb",
            "ALTER TABLE documents ADD COLUMN IF NOT EXISTS personal_email VARCHAR DEFAULT ''",
            "ALTER TABLE hiring_requests ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMP",
            "ALTER TABLE hiring_requests ADD COLUMN IF NOT EXISTS role_brief TEXT DEFAULT ''",
            "ALTER TABLE assessments ADD COLUMN IF NOT EXISTS team VARCHAR DEFAULT ''",
            "ALTER TABLE assessments ADD COLUMN IF NOT EXISTS department VARCHAR DEFAULT ''",
            "ALTER TABLE assessments ADD COLUMN IF NOT EXISTS role VARCHAR DEFAULT ''",
            "ALTER TABLE onboarding_plans ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '{}'::jsonb",
        ):
            conn.execute(text(stmt))


def init_db() -> None:
    # Import models so they register on Base before create_all.
    from . import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _ensure_sqlite_columns()
    _ensure_pg_columns()
