"""Application settings.

Loads from environment variables, with a tiny built-in .env loader so we don't
need an extra dependency. All values have sensible defaults — the app runs with
zero configuration.
"""
from __future__ import annotations

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


def _load_dotenv(path: Path) -> None:
    """Minimal .env loader (KEY=VALUE lines). Existing env vars win."""
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key, value = key.strip(), value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


_load_dotenv(BASE_DIR / ".env")


class Settings:
    # AI
    AI_PROVIDER: str = os.getenv("AI_PROVIDER", "auto").lower()
    ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")
    ANTHROPIC_MODEL: str = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6")
    ANTHROPIC_BASE_URL: str = os.getenv("ANTHROPIC_BASE_URL", "https://api.anthropic.com")

    # Hosted OpenAI-compatible LLM (Groq, Google Gemini, OpenRouter, Together, OpenAI, ...).
    # Defaults to Groq's free tier. Just set OPENAI_API_KEY to turn it on.
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    OPENAI_BASE_URL: str = os.getenv("OPENAI_BASE_URL", "https://api.groq.com/openai/v1")
    OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "llama-3.3-70b-versatile")
    OPENAI_JSON_MODE: bool = os.getenv("OPENAI_JSON_MODE", "true").lower() == "true"
    OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    OLLAMA_MODEL: str = os.getenv("OLLAMA_MODEL", "llama3.1")

    # Embeddings: "auto" uses Ollama embeddings if available, else hashing fallback.
    EMBEDDINGS_PROVIDER: str = os.getenv("EMBEDDINGS_PROVIDER", "auto").lower()
    OLLAMA_EMBED_MODEL: str = os.getenv("OLLAMA_EMBED_MODEL", "nomic-embed-text")

    # Database. Render/Heroku hand out `postgres://` or `postgresql://` URLs, which
    # SQLAlchemy routes to psycopg2 — but we install psycopg3, so normalise to the
    # explicit `postgresql+psycopg://` driver. (docker-compose already uses +psycopg.)
    DATABASE_URL: str = (
        os.getenv("DATABASE_URL", f"sqlite:///{BASE_DIR / 'hr_os.db'}")
        .replace("postgresql://", "postgresql+psycopg://", 1)
        .replace("postgres://", "postgresql+psycopg://", 1)
    )

    # Email (SMTP). If SMTP_HOST is empty, emails are logged to console + DB instead of sent.
    SMTP_HOST: str = os.getenv("SMTP_HOST", "")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USER: str = os.getenv("SMTP_USER", "")
    SMTP_PASSWORD: str = os.getenv("SMTP_PASSWORD", "")
    SMTP_STARTTLS: bool = os.getenv("SMTP_STARTTLS", "true").lower() == "true"
    EMAIL_FROM: str = os.getenv("EMAIL_FROM", "talent@example.com")
    EMAIL_FROM_NAME: str = os.getenv("EMAIL_FROM_NAME", "Talent Team")
    COMPANY_NAME: str = os.getenv("COMPANY_NAME", "Our Company")
    COMPANY_WEBSITE: str = os.getenv("COMPANY_WEBSITE", "")  # shown on careers/feeds
    COMPANY_COUNTRY: str = os.getenv("COMPANY_COUNTRY", "India")

    # Public base URL of the deployed careers site (e.g. https://careers.acme.com).
    # Job-board aggregators require ABSOLUTE urls in feeds, so this is used to build
    # them. On Render, RENDER_EXTERNAL_URL is auto-injected, so it works zero-config.
    # Empty → we fall back to the incoming request's base url (fine in dev).
    PUBLIC_BASE_URL: str = (
        os.getenv("PUBLIC_BASE_URL") or os.getenv("RENDER_EXTERNAL_URL") or ""
    ).rstrip("/")

    # CORS
    FRONTEND_ORIGIN: str = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")

    @property
    def email_configured(self) -> bool:
        return bool(self.SMTP_HOST)


settings = Settings()
