"""Password hashing — stdlib PBKDF2, no extra dependencies.

We store salted hashes (never plaintext). Format: pbkdf2$<iterations>$<salt_hex>$<hash_hex>.
Login isn't enforced yet, but storing real hashes keeps credentials honest and future-proof.
"""
from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import string

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
