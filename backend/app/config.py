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
    EMAIL_FROM: str = os.getenv("EMAIL_FROM", "talent@ez.works")
    EMAIL_FROM_NAME: str = os.getenv("EMAIL_FROM_NAME", "EZ Works Talent")
    COMPANY_NAME: str = os.getenv("COMPANY_NAME", "EZ Works")
    COMPANY_WEBSITE: str = os.getenv("COMPANY_WEBSITE", "https://www.ez.works")  # shown on careers/feeds
    COMPANY_COUNTRY: str = os.getenv("COMPANY_COUNTRY", "India")
    # Fixed company block injected into EVERY job description (and the careers page / public
    # meta). Set via env to override; the default below is the canonical EZ "About" + links.
    COMPANY_ABOUT: str = os.getenv(
        "COMPANY_ABOUT",
        "EZ is the services factory of the world. We combine the power of AI with human "
        "expertise so organizations can move faster, work smarter, and scale seamlessly. With "
        "15 capabilities across 5 service lines and 70+ specialized offerings, we are "
        "reimagining the traditional way of working — driving speed, precision, and scalability "
        "through technology-led innovation and applied AI. From global enterprises to Big 4 firms "
        "and ministries, EZ acts as a trusted extended team for professionals worldwide.\n\n"
        "Progress at EZ is intentional. While we push boundaries with AI, we remain deeply "
        "committed to a people-first culture — one that empowers individuals to grow, take "
        "ownership, and create meaningful impact. At EZ, growth is mutual: You Grow, We Grow. "
        "Your journey starts here.\n\n"
        "Explore more about EZ:\n"
        "Website: https://www.ez.works\n"
        "Instagram: https://www.instagram.com/ez_works_\n"
        "Twitter/X: https://twitter.com/EZ_Official\n"
        "LinkedIn: https://www.linkedin.com/company/ez-works\n"
        "Facebook: https://www.facebook.com/EZWorksglobal",
    )

    # ── Direct posting integrations (optional; graceful no-op until configured) ──
    # Google Indexing API (FREE): push each JobPosting URL to Google for near-instant
    # indexing on Google for Jobs. Provide a service-account key as a file path OR
    # inline JSON (handy for Render env vars). Needs Search Console ownership of the
    # careers domain. See GET /api/distribution/integrations.
    GOOGLE_INDEXING_SA_FILE: str = os.getenv("GOOGLE_INDEXING_SA_FILE", "")
    GOOGLE_INDEXING_SA_JSON: str = os.getenv("GOOGLE_INDEXING_SA_JSON", "")
    # LinkedIn company-page auto-share (FREE): post a job announcement to a Company
    # Page via the Posts API. Needs an org access token (w_organization_social) and the
    # organization URN, e.g. "urn:li:organization:1234567".
    LINKEDIN_ACCESS_TOKEN: str = os.getenv("LINKEDIN_ACCESS_TOKEN", "")
    LINKEDIN_ORG_URN: str = os.getenv("LINKEDIN_ORG_URN", "")
    LINKEDIN_API_VERSION: str = os.getenv("LINKEDIN_API_VERSION", "202405")

    # Public base URL of the deployed careers site (e.g. https://careers.acme.com).
    # Job-board aggregators require ABSOLUTE urls in feeds, so this is used to build
    # them. On Render, RENDER_EXTERNAL_URL is auto-injected, so it works zero-config.
    # Empty → we fall back to the incoming request's base url (fine in dev).
    PUBLIC_BASE_URL: str = (
        os.getenv("PUBLIC_BASE_URL") or os.getenv("RENDER_EXTERNAL_URL") or ""
    ).rstrip("/")

    # ── Authentication ──────────────────────────────────────────────────────────
    # HMAC secret for signing session tokens. MUST be set to a strong random value in
    # production (otherwise tokens are forgeable). A default is used in dev with a warning.
    SECRET_KEY: str = os.getenv("SECRET_KEY", "dev-insecure-change-me")
    TOKEN_TTL_HOURS: int = int(os.getenv("TOKEN_TTL_HOURS", "168"))  # session length (7 days)
    # First-run bootstrap admin. Only auto-created when ADMIN_PASSWORD is set; otherwise the
    # FIRST person to sign up via the UI becomes the admin/owner (no log-password hunting).
    ADMIN_EMAIL: str = os.getenv("ADMIN_EMAIL", "admin@hr-os.local")
    ADMIN_PASSWORD: str = os.getenv("ADMIN_PASSWORD", "")
    # Self-service sign-up. The first user is ALWAYS allowed (becomes admin). After that,
    # open sign-up is OFF by default — flip ALLOW_SIGNUP=true to let anyone register.
    ALLOW_SIGNUP: bool = os.getenv("ALLOW_SIGNUP", "false").lower() == "true"
    SIGNUP_DEFAULT_ROLE: str = os.getenv("SIGNUP_DEFAULT_ROLE", "admin")  # role for non-first signups
    SIGNUP_ALLOWED_DOMAIN: str = os.getenv("SIGNUP_ALLOWED_DOMAIN", "")  # e.g. "ez.works" to restrict

    # CORS
    FRONTEND_ORIGIN: str = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")

    # Single-service deploy: when the built React UI is present at this directory, the
    # backend serves it so the UI, API and careers pages share one origin (no separate
    # static host, no VITE_API_BASE). Empty in dev (Vite serves the UI on :5173).
    FRONTEND_DIST_DIR: str = os.getenv("FRONTEND_DIST_DIR", "")

    @property
    def email_configured(self) -> bool:
        return bool(self.SMTP_HOST)

    @property
    def secret_is_default(self) -> bool:
        return self.SECRET_KEY == "dev-insecure-change-me"

    @property
    def google_indexing_configured(self) -> bool:
        return bool(self.GOOGLE_INDEXING_SA_FILE or self.GOOGLE_INDEXING_SA_JSON)

    @property
    def linkedin_configured(self) -> bool:
        return bool(self.LINKEDIN_ACCESS_TOKEN and self.LINKEDIN_ORG_URN)


settings = Settings()
