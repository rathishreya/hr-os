"""Password hashing — stdlib PBKDF2, no extra dependencies.

We store salted hashes (never plaintext). Format: pbkdf2$<iterations>$<salt_hex>$<hash_hex>.
Login isn't enforced yet, but storing real hashes keeps credentials honest and future-proof.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import string
import time

_ITERATIONS = 240_000
_ALPHABET = string.ascii_letters + string.digits + "!@#$%*?"


def generate_password(length: int = 14) -> str:
    return "".join(secrets.choice(_ALPHABET) for _ in range(length))


def hash_password(password: str) -> str:
    if not password:
        return ""
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, _ITERATIONS)
    return f"pbkdf2${_ITERATIONS}${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, iters, salt_hex, hash_hex = stored.split("$")
        if scheme != "pbkdf2":
            return False
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), int(iters))
        return hmac.compare_digest(dk.hex(), hash_hex)
    except (ValueError, AttributeError):
        return False


# ── Stateless session tokens (HMAC-signed, stdlib only — no extra dependency) ──
# Format: base64url(payload_json) + "." + base64url(hmac_sha256(secret, payload)).

def _b64e(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _b64d(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def create_token(user_id: int, secret: str, ttl_hours: int = 168) -> str:
    payload = {"uid": int(user_id), "exp": int(time.time()) + ttl_hours * 3600}
    body = _b64e(json.dumps(payload, separators=(",", ":")).encode())
    sig = _b64e(hmac.new(secret.encode(), body.encode(), hashlib.sha256).digest())
    return f"{body}.{sig}"


def decode_token(token: str, secret: str) -> int | None:
    """Return the user id if the token is valid and unexpired, else None."""
    try:
        body, sig = token.split(".", 1)
        expected = _b64e(hmac.new(secret.encode(), body.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(sig, expected):
            return None
        payload = json.loads(_b64d(body))
        if int(payload.get("exp", 0)) < int(time.time()):
            return None
        return int(payload["uid"])
    except Exception:
        return None


# ── Password-reset tokens ──
# Short-lived, single-use links for "forgot password". The signing key folds in the user's
# CURRENT password_hash, so the moment the password changes (a successful reset, or any other
# update) every outstanding reset link for that user stops validating — one-time use, for free.

def create_reset_token(user_id: int, password_hash: str, secret: str, ttl_minutes: int = 60) -> str:
    payload = {"uid": int(user_id), "purpose": "reset", "exp": int(time.time()) + ttl_minutes * 60}
    body = _b64e(json.dumps(payload, separators=(",", ":")).encode())
    key = f"{secret}|reset|{password_hash or ''}".encode()
    sig = _b64e(hmac.new(key, body.encode(), hashlib.sha256).digest())
    return f"{body}.{sig}"


def reset_token_uid(token: str) -> int | None:
    """Parse the (UNVERIFIED) uid from a reset token, so the caller can load that user and verify
    the signature with their current password_hash. Never trust this without verify_reset_token."""
    try:
        body, _ = token.split(".", 1)
        p = json.loads(_b64d(body))
        return int(p["uid"]) if p.get("purpose") == "reset" else None
    except Exception:
        return None


def verify_reset_token(token: str, password_hash: str, secret: str) -> int | None:
    try:
        body, sig = token.split(".", 1)
        p = json.loads(_b64d(body))
        if p.get("purpose") != "reset" or int(p.get("exp", 0)) < int(time.time()):
            return None
        key = f"{secret}|reset|{password_hash or ''}".encode()
        expected = _b64e(hmac.new(key, body.encode(), hashlib.sha256).digest())
        return int(p["uid"]) if hmac.compare_digest(sig, expected) else None
    except Exception:
        return None
