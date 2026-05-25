"""FastAPI application entrypoint."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .database import init_db
from .routers import candidates, careers, comms, documents, hiring_requests, interview_rounds, jobs, onboarding, pipeline, screening
from .services.ai import ai


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
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
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(hiring_requests.router)
app.include_router(jobs.router)
app.include_router(candidates.router)
app.include_router(pipeline.router)
app.include_router(comms.router)
app.include_router(screening.router)
app.include_router(interview_rounds.router)
app.include_router(documents.router)
app.include_router(onboarding.router)
app.include_router(careers.router)  # public careers pages (no /api prefix)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


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
    }
