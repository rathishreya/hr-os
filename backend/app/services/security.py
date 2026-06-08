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
