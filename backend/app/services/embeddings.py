"""Text embeddings with a real provider + a dependency-free fallback.

Provider order (EMBEDDINGS_PROVIDER=auto):
  1. Ollama embeddings API (e.g. `nomic-embed-text`) — real semantic vectors, open source
  2. Hashing bag-of-words vectorizer — deterministic, zero-dependency fallback

NOTE: vectors from different providers aren't comparable. Pick a provider per
deployment; if you switch, re-embed existing candidates (re-run the seed / re-ingest).
Cosine returns 0 for mismatched dimensions so a mix never produces bogus matches.
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


def _resolve_provider() -> str:
    global _provider_cache, _demoted_until
    choice = settings.EMBEDDINGS_PROVIDER
    if choice == "hash":
        _provider_cache = "hash"
        return "hash"
    if _provider_cache == "ollama":
        return "ollama"
    # Stay on hash without re-probing until the cooldown elapses (set on a failed probe or a
    # mid-run embed failure) — then fall through and re-probe so a cold-start/restart self-heals.
    if _provider_cache == "hash" and time.monotonic() < _demoted_until:
        return "hash"
    # Health-check (with a cold-load-tolerant timeout) before arming the Ollama path, so a
    # down server doesn't make every embed() block on a timeout before falling back to hash.
    if choice in ("ollama", "auto") and _ollama_embed("ping", timeout=_PROBE_TIMEOUT) is not None:
        _provider_cache = "ollama"
    else:
        _provider_cache = "hash"
        _demoted_until = time.monotonic() + _DEMOTE_COOLDOWN  # cache the result; re-probe later
        if choice in ("ollama", "auto"):
            logger.warning(
                "Embeddings: Ollama unreachable at %s — using the hash fallback (semantic "
                "matching reduced). Set EMBEDDINGS_PROVIDER=hash to silence this.",
                settings.OLLAMA_BASE_URL,
            )
    return _provider_cache


def embed(text: str) -> list[float]:
    global _provider_cache, _demoted_until
    text = text or ""
    if _resolve_provider() == "ollama":
        vec = _ollama_embed(text)
        if vec is not None:
            return vec
        # Transient mid-run failure: fall back to hash, but only for a cooldown window (not
        # permanently) so a blip or cold-start re-probes and recovers instead of latching off.
        _provider_cache = "hash"
        _demoted_until = time.monotonic() + _DEMOTE_COOLDOWN
        logger.warning("Embeddings: Ollama embed failed; using hash for ~%ss then re-probing.", int(_DEMOTE_COOLDOWN))
    return _hash_embed(text)


def cosine(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    return max(0.0, min(1.0, sum(x * y for x, y in zip(a, b))))
