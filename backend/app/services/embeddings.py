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
import math
import re

import httpx

from ..config import settings

DIM = 256
_TOKEN = re.compile(r"[a-z0-9+#.]+")
_provider_cache: str | None = None


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


def _ollama_embed(text: str) -> list[float] | None:
    try:
        resp = httpx.post(
            f"{settings.OLLAMA_BASE_URL}/api/embeddings",
            json={"model": settings.OLLAMA_EMBED_MODEL, "prompt": text[:8000]},
            timeout=30,
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
    global _provider_cache
    if _provider_cache:
        return _provider_cache
    choice = settings.EMBEDDINGS_PROVIDER
    if choice == "hash":
        _provider_cache = "hash"
    elif choice == "ollama" or (choice == "auto" and _ollama_embed("ping") is not None):
        _provider_cache = "ollama"
    else:
        _provider_cache = "hash"
    return _provider_cache


def embed(text: str) -> list[float]:
    text = text or ""
    if _resolve_provider() == "ollama":
        vec = _ollama_embed(text)
        if vec is not None:
            return vec
    return _hash_embed(text)


def cosine(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    return max(0.0, min(1.0, sum(x * y for x, y in zip(a, b))))
