"""Text embeddings with real providers + a dependency-free fallback.

Provider order (EMBEDDINGS_PROVIDER=auto):
  1. Gemini embeddings (generativelanguage `text-embedding-004`) — hosted, real semantic
     vectors, reuses the configured Gemini key (OPENAI_API_KEY + a generativelanguage base)
  2. Ollama embeddings API (e.g. `nomic-embed-text`) — real semantic vectors, open source
  3. Hashing bag-of-words vectorizer — deterministic, zero-dependency fallback

Successful real-provider vectors are cached in-process by (provider, text) so repeated skill
strings cost one API call total. NOTE: vectors from different providers aren't comparable;
cosine returns 0 for mismatched dimensions so a provider switch never produces bogus matches.
"""
from __future__ import annotations

import hashlib
import logging
import math
import re
import time

import httpx

from ..config import settings

logger = logging.getLogger(__name__)

DIM = 256
_TOKEN = re.compile(r"[a-z0-9+#.]+")
_provider_cache: str | None = None
_demoted_until: float = 0.0  # monotonic deadline; stay on hash (no re-probe) until then

_PROBE_TIMEOUT = 30.0   # one-time health check — tolerant of an Ollama model cold-load
_CALL_TIMEOUT = 15.0    # per-embed once the model is warm
_DEMOTE_COOLDOWN = 120.0  # after a mid-run failure, use hash this long, then re-probe (self-heal)

# Cache successful real-provider vectors by (provider, text) — skills repeat heavily across
# candidates/roles, so this keeps hosted-embedding cost to one call per distinct string.
_EMBED_CACHE: dict[tuple[str, str], list[float]] = {}
_EMBED_CACHE_MAX = 50000


def _tokens(text: str) -> list[str]:
    return _TOKEN.findall(text.lower())


def _stable_hash(tok: str) -> int:
    # Built-in hash() is salted per process; use a stable digest so embeddings
    # remain comparable across restarts.
    return int.from_bytes(hashlib.md5(tok.encode("utf-8")).digest()[:4], "big")


def _hash_embed(text: str) -> list[float]:
    vec = [0.0] * DIM
    for tok in _tokens(text):
        vec[_stable_hash(tok) % DIM] += 1.0
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [round(v / norm, 6) for v in vec]


def _ollama_embed(text: str, timeout: float = _CALL_TIMEOUT) -> list[float] | None:
    try:
        resp = httpx.post(
            f"{settings.OLLAMA_BASE_URL}/api/embeddings",
            json={"model": settings.OLLAMA_EMBED_MODEL, "prompt": text[:8000]},
            timeout=timeout,
        )
        resp.raise_for_status()
        vec = resp.json().get("embedding")
        if vec:
            norm = math.sqrt(sum(v * v for v in vec)) or 1.0
            return [round(v / norm, 6) for v in vec]
    except Exception:
        return None
    return None


def _gemini_embed(text: str, timeout: float = _CALL_TIMEOUT) -> list[float] | None:
    """Embed via Google's generativelanguage embedContent endpoint (reuses the Gemini key).
    Returns a normalized vector, or None on any failure (caller falls back to hash)."""
    if not settings.gemini_embeddings_configured:
        return None
    base = (settings.embed_base or "").rstrip("/")
    model = settings.GEMINI_EMBED_MODEL
    url = f"{base}/models/{model}:embedContent?key={settings.embed_key}"
    try:
        resp = httpx.post(
            url,
            json={"model": f"models/{model}", "content": {"parts": [{"text": (text or "")[:8000]}]}},
            timeout=timeout,
        )
        if resp.status_code == 429:  # quota — let the caller demote to hash for the cooldown
            return None
        resp.raise_for_status()
        vec = (resp.json().get("embedding") or {}).get("values")
        if vec:
            norm = math.sqrt(sum(v * v for v in vec)) or 1.0
            return [round(v / norm, 6) for v in vec]
    except Exception:
        return None
    return None


def _resolve_provider() -> str:
    global _provider_cache, _demoted_until
    choice = settings.EMBEDDINGS_PROVIDER
    if choice == "hash":
        _provider_cache = "hash"
        return "hash"
    if _provider_cache in ("ollama", "gemini"):
        return _provider_cache
    # Stay on hash without re-probing until the cooldown elapses (set on a failed probe or a
    # mid-run embed failure) — then fall through and re-probe so a cold-start/restart self-heals.
    if _provider_cache == "hash" and time.monotonic() < _demoted_until:
        return "hash"

    # Hosted Gemini: no network probe needed — key presence is enough (a real embed that fails
    # at runtime demotes to hash for the cooldown, then we re-probe).
    if choice in ("gemini", "auto") and settings.gemini_embeddings_configured:
        _provider_cache = "gemini"
        return "gemini"
    # Ollama: health-check (cold-load-tolerant) before arming it, so a down server doesn't make
    # every embed() block on a timeout before falling back to hash.
    if choice in ("ollama", "auto") and _ollama_embed("ping", timeout=_PROBE_TIMEOUT) is not None:
        _provider_cache = "ollama"
        return "ollama"

    _provider_cache = "hash"
    _demoted_until = time.monotonic() + _DEMOTE_COOLDOWN
    if choice in ("ollama", "gemini", "auto"):
        logger.warning(
            "Embeddings: no real embedder reachable (Gemini configured=%s, Ollama=%s) — using "
            "the hash fallback. Set EMBEDDINGS_PROVIDER=hash to silence this.",
            settings.gemini_embeddings_configured, settings.OLLAMA_BASE_URL,
        )
    return "hash"


def embed(text: str) -> list[float]:
    global _provider_cache, _demoted_until
    text = text or ""
    provider = _resolve_provider()
    if provider in ("ollama", "gemini"):
        ckey = (provider, text)
        cached = _EMBED_CACHE.get(ckey)
        if cached is not None:
            return cached
        vec = _gemini_embed(text) if provider == "gemini" else _ollama_embed(text)
        if vec is not None:
            if len(_EMBED_CACHE) < _EMBED_CACHE_MAX:
                _EMBED_CACHE[ckey] = vec
            return vec
        # Transient mid-run failure (quota/network): fall back to hash for a cooldown window so a
        # blip re-probes and recovers instead of latching off permanently.
        _provider_cache = "hash"
        _demoted_until = time.monotonic() + _DEMOTE_COOLDOWN
        logger.warning("Embeddings: %s embed failed; using hash for ~%ss then re-probing.", provider, int(_DEMOTE_COOLDOWN))
    return _hash_embed(text)


def cosine(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    return max(0.0, min(1.0, sum(x * y for x, y in zip(a, b))))
