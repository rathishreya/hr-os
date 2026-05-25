"""Resume text extraction.

Tries optional open-source libraries for PDF/DOCX; degrades gracefully to plain-text
decoding so the feature works even when those libs aren't installed.
"""
from __future__ import annotations

import io


def extract_text(filename: str, content: bytes) -> str:
    name = (filename or "").lower()

    if name.endswith(".pdf"):
        try:
            import pdfplumber  # type: ignore

            with pdfplumber.open(io.BytesIO(content)) as pdf:
                return "\n".join(page.extract_text() or "" for page in pdf.pages).strip()
        except Exception:
            pass  # fall through to text decode

    if name.endswith(".docx"):
        try:
            import docx  # type: ignore

            doc = docx.Document(io.BytesIO(content))
            return "\n".join(p.text for p in doc.paragraphs).strip()
        except Exception:
            pass

    # .txt or unknown -> best-effort decode
    for encoding in ("utf-8", "latin-1"):
        try:
            return content.decode(encoding).strip()
        except Exception:
            continue
    return ""
