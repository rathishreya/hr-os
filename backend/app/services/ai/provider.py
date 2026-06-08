"""Pluggable AI provider layer.

Selection order (when AI_PROVIDER=auto):
    1. Claude  — if ANTHROPIC_API_KEY is set
    2. Ollama  — if a local server answers on OLLAMA_BASE_URL
    3. Mock    — deterministic, always-available fallback

Every high-level call (`ai.generate_jd`, `ai.score_candidate`, ...) routes through
`AIService._run`, which catches *any* provider error or malformed JSON and falls back
to the mock generator for that task. The API therefore never hard-fails on AI.
"""
from __future__ import annotations

import json
import re
from typing import Any

import httpx

from ...config import settings
from . import mock, prompts


def _extract_json(text: str) -> Any:
    """Best-effort JSON extraction from an LLM response."""
    cleaned = text.strip()
    # Strip ```json ... ``` fences if present.
    fence = re.search(r"```(?:json)?\s*(.*?)```", cleaned, re.DOTALL)
    if fence:
        cleaned = fence.group(1).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass
    # Fall back to the first balanced {...} or [...] block.
    match = re.search(r"(\{.*\}|\[.*\])", cleaned, re.DOTALL)
    if match:
        return json.loads(match.group(1))
    raise ValueError("No JSON found in model response")


class BaseProvider:
    name = "base"

    def generate(self, system: str, user: str, *, want_json: bool) -> str:
        raise NotImplementedError


class ClaudeProvider(BaseProvider):
    name = "claude"

    def generate(self, system: str, user: str, *, want_json: bool) -> str:
        resp = httpx.post(
            f"{settings.ANTHROPIC_BASE_URL}/v1/messages",
            headers={
                "x-api-key": settings.ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": settings.ANTHROPIC_MODEL,
                "max_tokens": 2500,
                "system": system,
                "messages": [{"role": "user", "content": user}],
            },
            timeout=90,
        )
        resp.raise_for_status()
        data = resp.json()
        return "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")


class OpenAICompatProvider(BaseProvider):
    """Any OpenAI-compatible chat API: Groq, Gemini (OpenAI endpoint), OpenRouter, Together, OpenAI."""

    def __init__(self) -> None:
        base = settings.OPENAI_BASE_URL.lower()
        self.name = (
            "groq" if "groq" in base else
            "gemini" if "google" in base or "gemini" in base else
            "openrouter" if "openrouter" in base else
            "openai" if "openai.com" in base else "hosted"
        )

    def generate(self, system: str, user: str, *, want_json: bool) -> str:
        body: dict[str, Any] = {
            "model": settings.OPENAI_MODEL,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": 0.4,
        }
        if want_json and settings.OPENAI_JSON_MODE:
            body["response_format"] = {"type": "json_object"}
        resp = httpx.post(
            f"{settings.OPENAI_BASE_URL.rstrip('/')}/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
                "Content-Type": "application/json",
            },
            json=body,
            timeout=90,
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]


class OllamaProvider(BaseProvider):
    name = "ollama"

    def generate(self, system: str, user: str, *, want_json: bool) -> str:
        payload: dict[str, Any] = {
            "model": settings.OLLAMA_MODEL,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "stream": False,
            "options": {"temperature": 0.4},
        }
        if want_json:
            payload["format"] = "json"
        resp = httpx.post(f"{settings.OLLAMA_BASE_URL}/api/chat", json=payload, timeout=180)
        resp.raise_for_status()
        return resp.json().get("message", {}).get("content", "")


class MockProvider(BaseProvider):
    """Never used for `generate` directly — AIService calls mock.* task functions."""

    name = "mock"

    def generate(self, system: str, user: str, *, want_json: bool) -> str:  # pragma: no cover
        return "{}"


def _ollama_available() -> bool:
    try:
        httpx.get(f"{settings.OLLAMA_BASE_URL}/api/tags", timeout=1.5).raise_for_status()
        return True
    except Exception:
        return False


def get_provider() -> BaseProvider:
    choice = settings.AI_PROVIDER
    if choice == "claude":
        return ClaudeProvider()
    if choice in ("openai", "groq", "gemini", "openrouter", "hosted"):
        return OpenAICompatProvider()
    if choice == "ollama":
        return OllamaProvider()
    if choice == "mock":
        return MockProvider()
    # auto: prefer the strongest configured provider
    if settings.ANTHROPIC_API_KEY:
        return ClaudeProvider()
    if settings.OPENAI_API_KEY:
        return OpenAICompatProvider()
    if _ollama_available():
        return OllamaProvider()
    return MockProvider()


class AIService:
    """High-level, task-oriented AI facade used by the rest of the app."""

    def __init__(self) -> None:
        self._provider: BaseProvider | None = None

    @property
    def provider(self) -> BaseProvider:
        if self._provider is None:
            self._provider = get_provider()
        return self._provider

    def refresh(self) -> None:
        self._provider = get_provider()

    def _run(
        self,
        task: str,
        system: str,
        user: str,
        *,
        context: dict[str, Any],
        want_json: bool = True,
    ) -> tuple[Any, str]:
        """Run a task on the active provider; fall back to mock on any failure."""
        provider = self.provider
        if not isinstance(provider, MockProvider):
            try:
                raw = provider.generate(system, user, want_json=want_json)
                if not want_json:
                    return raw, provider.name
                parsed = _extract_json(raw)
                # Every JSON task expects an object; a bare array/scalar is malformed —
                # degrade to the mock (which always returns the right shape) instead of
                # handing a non-dict to callers that do result.get(...).
                if isinstance(parsed, dict):
                    return parsed, provider.name
            except Exception:
                pass  # graceful degradation -> mock
        return mock.run(task, context), "mock"

    # ---- high-level tasks ----
    def validate_hiring_request(self, hr: dict[str, Any]) -> tuple[dict, str]:
        system, user = prompts.hiring_request(hr)
        return self._run("validate_hiring_request", system, user, context={"hr": hr})

    def generate_jd(self, hr: dict[str, Any]) -> tuple[dict, str]:
        system, user = prompts.job_description(hr)
        return self._run("generate_jd", system, user, context={"hr": hr})

    def suggest_skills(self, payload: dict[str, Any]) -> tuple[dict, str]:
        system, user = prompts.suggest_skills(payload)
        return self._run("suggest_skills", system, user, context={"payload": payload})

    def generate_video_questions(self, role: dict[str, Any]) -> tuple[dict, str]:
        system, user = prompts.video_interview_questions(role)
        return self._run("generate_video_questions", system, user, context={"role": role})

    def parse_resume(self, resume_text: str) -> tuple[dict, str]:
        system, user = prompts.parse_resume(resume_text)
        return self._run("parse_resume", system, user, context={"resume_text": resume_text})

    def score_candidate(
        self, hr: dict[str, Any], parsed: dict[str, Any], weights: dict[str, float]
    ) -> tuple[dict, str]:
        system, user = prompts.score_candidate(hr, parsed)
        return self._run(
            "score_candidate", system, user, context={"hr": hr, "parsed": parsed, "weights": weights}
        )

    def compose_email(self, template: str, ctx: dict[str, Any]) -> tuple[dict, str]:
        system, user = prompts.compose_email(template, ctx)
        return self._run("compose_email", system, user, context={"ctx": ctx})

    def assessment_email(self, ctx: dict[str, Any]) -> tuple[dict, str]:
        system, user = prompts.assessment_email(ctx)
        return self._run("assessment_email", system, user, context={"ctx": ctx})

    def screening_questions(self, hr: dict[str, Any], parsed: dict[str, Any]) -> tuple[dict, str]:
        system, user = prompts.screening_questions(hr, parsed)
        return self._run("screening_questions", system, user, context={"hr": hr, "parsed": parsed})

    def evaluate_screening(self, hr: dict[str, Any], transcript: list[dict[str, Any]]) -> tuple[dict, str]:
        system, user = prompts.evaluate_screening(hr, transcript)
        return self._run("evaluate_screening", system, user, context={"hr": hr, "transcript": transcript})

    def evaluate_video_interview(
        self, role: dict[str, Any], questions: list[str], transcript: str, timeline: list[dict[str, Any]]
    ) -> tuple[dict, str]:
        system, user = prompts.evaluate_video(role, questions, transcript, timeline)
        return self._run(
            "evaluate_video", system, user,
            context={"role": role, "questions": questions, "transcript": transcript, "timeline": timeline},
        )

    def generate_document(self, doc_type: str, ctx: dict[str, Any]) -> tuple[dict, str]:
        system, user = prompts.generate_document(doc_type, ctx)
        return self._run("generate_document", system, user, context={"doc_type": doc_type, "ctx": ctx})

    def generate_onboarding(self, ctx: dict[str, Any]) -> tuple[dict, str]:
        system, user = prompts.generate_onboarding(ctx)
        return self._run("generate_onboarding", system, user, context={"ctx": ctx})


ai = AIService()
