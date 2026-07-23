"""Optional S3 (or S3-compatible) object storage for large media — interview recordings.

Active only when S3 is configured (settings.s3_enabled). The win over DB (BYTEA) storage is that
uploads are STREAMED (boto3 upload_fileobj → multipart), so a large recording is never loaded whole
into memory — which is what OOM'd the small instance. Recordings live in a PRIVATE bucket and are
served via short-lived presigned GET URLs, so they're not publicly listable or permanent links.
"""
from __future__ import annotations

from typing import BinaryIO

from ..config import settings

_client = None


def _s3():
    """Lazily build the boto3 client (import kept lazy so the dep is optional)."""
    global _client
    if _client is None:
        import boto3  # imported lazily — only needed when S3 is enabled
        kwargs = {"region_name": settings.S3_REGION, "endpoint_url": settings.S3_ENDPOINT_URL or None}
        # Explicit keys if provided; otherwise boto3 falls back to the IAM role / default chain.
        if settings.S3_ACCESS_KEY and settings.S3_SECRET_KEY:
            kwargs["aws_access_key_id"] = settings.S3_ACCESS_KEY
            kwargs["aws_secret_access_key"] = settings.S3_SECRET_KEY
        _client = boto3.client("s3", **kwargs)
    return _client


def upload_stream(fileobj: BinaryIO, key: str, content_type: str = "application/octet-stream") -> None:
    """Stream a file-like object to the bucket at `key` (no full in-memory read)."""
    try:
        fileobj.seek(0)
    except Exception:  # noqa: BLE001 — some streams aren't seekable; upload from current position
        pass
    _s3().upload_fileobj(fileobj, settings.S3_BUCKET, key, ExtraArgs={"ContentType": content_type})


def presigned_get(key: str, expires: int = 3600) -> str:
    """A time-limited (default 1h) URL to GET the private object directly from S3."""
    return _s3().generate_presigned_url(
        "get_object", Params={"Bucket": settings.S3_BUCKET, "Key": key}, ExpiresIn=expires
    )


def delete(key: str) -> None:
    """Best-effort delete; never raises (deletion is cleanup, not critical path)."""
    try:
        _s3().delete_object(Bucket=settings.S3_BUCKET, Key=key)
    except Exception:  # noqa: BLE001
        pass
