"""FastAPI application entrypoint."""
from __future__ import annotations

import re
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select

from .config import settings
from .database import SessionLocal, init_db
from .routers import admin, auth, assessments, candidates, careers, comms, distribution, documents, google_oauth, hiring_requests, interview_invite, interview_rounds, jobs, onboarding, onboarding_form, onboarding_module, outreach, pipeline, screening, tpos, users, video
from .services import embeddings, security
from .services.ai import ai


def _ensure_admin() -> None:
    """Bootstrap the first admin from ADMIN_EMAIL/ADMIN_PASSWORD, on an empty database only.

    This is now the ONLY way a fresh deployment gets its first account: self-signup was removed
    (see routers/auth.py), so account creation always begins with someone who already has access
    to the server's environment. Does nothing if any user already exists.
    """
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
    # No interactive docs in production: /docs, /redoc and the raw /openapi.json handed an
    # anonymous visitor a labelled map of every route and its request shape. This is a private
    # internal tool with no third-party API consumers, so nothing legitimate needs them.
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
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
#: /api/auth/signup and /api/auth/can-signup are deliberately absent: self-signup was removed
#: outright (see routers/auth.py), so there is nothing to allow through.
_PUBLIC_API = {"/api/auth/login", "/api/auth/forgot-password", "/api/auth/reset-password", "/api/health", "/api/company", "/api/ai-status", "/api/google/callback", "/api/tpos/intake", "/api/onboarding-form/submit"}


_ASSESS_FILE_RE = re.compile(r"^/api/assessments/(\d+)/files?(?:/\d+)?$")
_ONBOARD_FORM_RE = re.compile(r"^/api/onboarding-form/(\d+)/(prefill|submit)$")
#: The only video-interview paths a candidate reaches without logging in. Everything else in that
#: router (recordings, transcripts, the AI evaluation, delete, re-run) is recruiter-only and goes
#: through the normal auth gate — the router used to be exempt WHOLESALE, which made every
#: candidate's recording and AI verdict readable, and deletable, by anyone on the internet.
_VIDEO_CANDIDATE_POST_RE = re.compile(r"^/api/video-interview/\d+/(recording|answer)$")
#: A reviewer's signed recording link (GET), verified against the HMAC in the query string.
_VIDEO_REC_RE = re.compile(r"^/api/video-interview/(\d+)/recording$")


def _is_public_video(request: Request) -> bool:
    path = request.url.path
    method = request.method
    # get_or_create: returns only the questions + status to an anonymous caller (the candidate's
    # own page), the full record only to a logged-in recruiter — the split lives in the handler.
    if path == "/api/video-interview" and method == "GET":
        return True
    # The candidate enters their emailed access code here...
    if path == "/api/video-interview/verify" and method == "POST":
        return True
    # ...and submits under it here; each of these verifies the code itself before writing.
    if method == "POST" and _VIDEO_CANDIDATE_POST_RE.match(path):
        return True
    return False


def _is_public_api(request: Request) -> bool:
    path = request.url.path
    if path in _PUBLIC_API:
        return True
    if _is_public_video(request):
        return True
    # Candidate assessment-file download via a SIGNED token (the link we email them). Recruiters
    # hit the same route WITH an auth header (no token) and fall through to the normal gate below.
    m = _ASSESS_FILE_RE.match(path)
    if m and security.verify_resource(
        f"assessment:{m.group(1)}:file", request.query_params.get("t", ""), settings.SECRET_KEY
    ):
        return True
    # A candidate's own onboarding form, reached from the link emailed with their offer letter.
    # Public only with a matching signature; without one it falls through to the gate below.
    m = _ONBOARD_FORM_RE.match(path)
    if m and security.verify_resource(
        f"onboarding:{m.group(1)}:form", request.query_params.get("t", ""), settings.SECRET_KEY
    ):
        return True
    # An interview recording opened in a plain <video>/<a> element (which cannot carry the bearer
    # header) by an authenticated reviewer. The signed `t` is minted server-side and handed only to
    # a logged-in recruiter inside the interview payload, so the recording is unguessable by id —
    # a request without a valid signature falls through to the normal gate.
    m = _VIDEO_REC_RE.match(path)
    if m and request.method == "GET" and security.verify_resource(
        f"interview:{m.group(1)}:recording", request.query_params.get("t", ""), settings.SECRET_KEY
    ):
        return True
    return False


@app.middleware("http")
async def auth_gate(request: Request, call_next):
    path = request.url.path
    if request.method == "OPTIONS" or not path.startswith("/api/") or _is_public_api(request):
        return await call_next(request)
    header = request.headers.get("authorization", "")
    token = header[7:].strip() if header[:7].lower() == "bearer " else ""
    uid = security.decode_token(token, settings.SECRET_KEY) if token else None
    if not uid:
        return JSONResponse({"detail": "Not authenticated"}, status_code=401)
    # A valid signature is not enough: confirm the user still exists and is active on every request,
    # here in the gate rather than trusting each of ~60 handlers to remember Depends(current_user).
    # Otherwise a 7-day token kept working for a full week after the account was deactivated or
    # deleted. One indexed primary-key lookup per API call.
    from . import models
    with SessionLocal() as db:
        u = db.get(models.User, uid)
        if not u or not u.active:
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
app.include_router(interview_invite.router)
app.include_router(google_oauth.router)
app.include_router(documents.router)
app.include_router(onboarding.router)
app.include_router(onboarding_form.router)
app.include_router(onboarding_module.router)
app.include_router(assessments.router)
app.include_router(users.router)
app.include_router(tpos.router)
app.include_router(outreach.router)
app.include_router(video.router)
app.include_router(distribution.router)
app.include_router(careers.router)  # public careers pages (no /api prefix)


@app.get("/api/health")
def health() -> dict:
    import os
    # Expose the running commit (Render injects RENDER_GIT_COMMIT) so a deploy can be verified,
    # plus which integrations are ACTIVE (booleans/names only — never secrets) so env-var config
    # can be confirmed with a single curl. The presence of these fields also proves a fresh image
    # is running (older builds return only status+commit).
    email = ("ses" if settings.ses_enabled
             else "sendgrid" if settings.SENDGRID_API_KEY
             else "smtp" if settings.SMTP_HOST else "log")
    return {
        "status": "ok",
        "commit": (os.getenv("RENDER_GIT_COMMIT") or "")[:7],
        "storage": "s3" if settings.s3_enabled else "db",
        "email": email,
        "aws_region": settings.S3_REGION,
    }


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

    _DIST_ROOT = _DIST.resolve()

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        # The API and careers pages are handled by the routers above; never shadow them.
        if full_path == "api" or full_path.startswith("api/") or full_path == "careers" or full_path.startswith("careers/"):
            raise HTTPException(status_code=404, detail="Not found")
        # Confine the join to the dist directory before serving. Without this, a path like
        # ../../etc/passwd (or an absolute path) would resolve outside the build and FileResponse
        # would hand back an arbitrary file from the container. Resolve, then require the result to
        # sit inside dist; anything else falls through to the SPA's index.html.
        target = (_DIST_ROOT / full_path).resolve()
        if full_path and target.is_file() and (target == _DIST_ROOT or _DIST_ROOT in target.parents):
            return FileResponse(str(target))
        return FileResponse(str(_DIST_ROOT / "index.html"))  # SPA fallback for client routes
