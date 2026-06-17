"""FastAPI application entrypoint."""
from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select

from .config import settings
from .database import SessionLocal, init_db
from .routers import admin, auth, assessments, candidates, careers, comms, distribution, documents, hiring_requests, interview_rounds, jobs, onboarding, outreach, pipeline, screening, tpos, users, video
from .services import embeddings, security
from .services.ai import ai


def _ensure_admin() -> None:
    """Optionally bootstrap an admin from ADMIN_EMAIL/ADMIN_PASSWORD. If ADMIN_PASSWORD is
    NOT set, we create nothing — the first person to sign up via the UI becomes the admin."""
    if not settings.ADMIN_PASSWORD:
        return
    from . import models
    with SessionLocal() as db:
        if db.scalar(select(models.User).limit(1)):
            return
        db.add(models.User(
            name="Admin", email=settings.ADMIN_EMAIL.strip().lower(),
            roles=["admin"], password_hash=security.hash_password(settings.ADMIN_PASSWORD), active=True,
        ))
        db.commit()
        print(f"\n[auth] Bootstrap admin created -- email: {settings.ADMIN_EMAIL} (password from ADMIN_PASSWORD)\n")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    _ensure_admin()
    if settings.secret_is_default:
        print("[auth] WARNING: SECRET_KEY is the insecure default — set SECRET_KEY in production.")
    if "gmail.com" in settings.SMTP_HOST and settings.SMTP_USER and settings.EMAIL_FROM.lower() != settings.SMTP_USER.lower():
        print(f"[email] WARNING: EMAIL_FROM ({settings.EMAIL_FROM}) != SMTP_USER ({settings.SMTP_USER}). "
              "Gmail will rewrite the From or flag it as spoofed unless EMAIL_FROM is a verified 'Send mail as' alias.")
    ai.refresh()
    yield


app = FastAPI(
    title="HR-OS — AI-native Hiring OS",
    version="0.2.0",
    description="Open-source, AI-powered recruitment operating system.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.FRONTEND_ORIGIN,
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    # Allow the static frontend when hosted on Render/Vercel (URLs aren't known until
    # deploy time), so cross-origin /api calls work without hand-editing FRONTEND_ORIGIN.
    allow_origin_regex=r"https://([a-z0-9-]+\.)*(onrender\.com|vercel\.app)$",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# ── Auth gate ─────────────────────────────────────────────────────────────────
# Require a valid token on every /api/* route except the public allowlist. Non-/api
# paths (the careers pages, the static UI, the candidate video-interview flow) are
# public by design. Sets request.state.user_id for the current_user dependency.
_PUBLIC_API = {"/api/auth/login", "/api/auth/signup", "/api/auth/can-signup", "/api/health", "/api/company", "/api/ai-status"}


def _is_public_api(path: str) -> bool:
    if path in _PUBLIC_API:
        return True
    # Candidate-facing async video interview (no login — secured per-interview is a TODO).
    if path.startswith("/api/video-interview"):
        return True
    return False


@app.middleware("http")
async def auth_gate(request: Request, call_next):
    path = request.url.path
    if request.method == "OPTIONS" or not path.startswith("/api/") or _is_public_api(path):
        return await call_next(request)
    header = request.headers.get("authorization", "")
    token = header[7:].strip() if header[:7].lower() == "bearer " else ""
    uid = security.decode_token(token, settings.SECRET_KEY) if token else None
    if not uid:
        return JSONResponse({"detail": "Not authenticated"}, status_code=401)
    request.state.user_id = uid
    return await call_next(request)

app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(hiring_requests.router)
app.include_router(jobs.router)
app.include_router(candidates.router)
app.include_router(pipeline.router)
app.include_router(comms.router)
app.include_router(screening.router)
app.include_router(interview_rounds.router)
app.include_router(documents.router)
app.include_router(onboarding.router)
app.include_router(assessments.router)
app.include_router(users.router)
app.include_router(tpos.router)
app.include_router(outreach.router)
app.include_router(video.router)
app.include_router(distribution.router)
app.include_router(careers.router)  # public careers pages (no /api prefix)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/company")
def company() -> dict:
    """Canonical company identity, used for the 'About the company' sections and careers pages."""
    return {
        "name": settings.COMPANY_NAME,
        "website": settings.COMPANY_WEBSITE,
        "about": settings.COMPANY_ABOUT,
        "country": settings.COMPANY_COUNTRY,
    }


@app.get("/api/ai-status")
def ai_status() -> dict:
    """Which AI provider is active, so the UI can show it."""
    name = ai.provider.name
    hosted = {"groq", "gemini", "openrouter", "openai", "hosted"}
    return {
        "provider": name,
        "configured": settings.AI_PROVIDER,
        "model": (
            settings.ANTHROPIC_MODEL if name == "claude"
            else settings.OPENAI_MODEL if name in hosted
            else settings.OLLAMA_MODEL if name == "ollama"
            else "rule-based fallback (no LLM connected)"
        ),
        # So an operator can confirm semantic résumé matching is live after setting env vars.
        "embeddings": embeddings.status(),
    }


# ── Serve the built React admin UI (single-service production deploy) ─────────
# When a built frontend is present (the Docker image copies it in and sets
# FRONTEND_DIST_DIR), FastAPI serves it so the UI, API and careers pages share one
# origin — no separate static host and no VITE_API_BASE to wire. Skipped in dev,
# where Vite serves the UI on :5173. Mounted last so it never shadows the routers.
def _frontend_dist() -> Path | None:
    candidates = []
    if settings.FRONTEND_DIST_DIR:
        candidates.append(Path(settings.FRONTEND_DIST_DIR))
    candidates.append(Path(__file__).resolve().parent.parent.parent / "frontend" / "dist")
    for c in candidates:
        if c.is_dir() and (c / "index.html").is_file():
            return c
    return None


_DIST = _frontend_dist()
if _DIST is not None:
    if (_DIST / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=str(_DIST / "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        # The API and careers pages are handled by the routers above; never shadow them.
        if full_path == "api" or full_path.startswith("api/") or full_path == "careers" or full_path.startswith("careers/"):
            raise HTTPException(status_code=404, detail="Not found")
        target = _DIST / full_path
        if full_path and target.is_file():
            return FileResponse(str(target))
        return FileResponse(str(_DIST / "index.html"))  # SPA fallback for client routes
