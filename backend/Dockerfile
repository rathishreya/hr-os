# Single-service image: build the React admin UI, then run FastAPI which serves the
# UI + API + public careers pages from one origin. Build context is the REPO ROOT
# (see render.yaml dockerContext: .), so the paths below are repo-relative.

# ── Stage 1: build the React admin UI ──
FROM node:22-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ── Stage 2: FastAPI backend (Python 3.12 — all wheels available) ──
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    FRONTEND_DIST_DIR=/srv/static

WORKDIR /srv

# System libs needed by pdfplumber/lxml
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libxml2-dev libxslt1-dev \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt backend/requirements-prod.txt ./
RUN pip install -r requirements-prod.txt

COPY backend/app ./app
COPY --from=web /web/dist ./static

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
