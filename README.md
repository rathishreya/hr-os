# HR-OS — AI-native Hiring Operating System

An open-source, AI-powered recruitment platform. Runs **locally with zero keys** (real
rule-based fallback — nothing is faked/static), and upgrades to full AI + real email the
moment you add credentials. Ships with a **Docker/Postgres** production stack and an
**MCP server** so AI agents can drive the whole hiring workflow.

### Deploy free in one click

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/rathishreya/hr-os)

Click the button → sign into Render → paste your free [Gemini key](https://aistudio.google.com/apikey).
Render reads [`render.yaml`](render.yaml) and provisions Postgres + backend + frontend on its free tier.
After the backend is live, set the frontend's `VITE_API_BASE` to `<backend-url>/api` and redeploy it.
(Full steps in [option C](#run-it--option-c-deploy-free-on-render) below.)

## What works today (all verified)

```
Hiring request ──► AI validation + difficulty + ETA + salary ──► AI Job Description
        │                                                              │
        └──► Candidate ingestion (paste OR PDF/DOCX/TXT upload) ◄───────┘
                    │
                    ▼
        Resume parse → embeddings → explainable weighted AI scoring → ranked pipeline
                    │
                    ▼
        AI chat screening interview ("beyond the resume") → stage management
                    │
                    ▼
        human override · REAL candidate emails (SMTP) · audit trail
```

> **No login required** — this is a basic, open hiring tool by design. Auth/RBAC is a later add-on.

- **AI is pluggable**: `Claude` (set `ANTHROPIC_API_KEY`) → `Ollama` (local) → deterministic rule-based fallback. Every call falls back gracefully, so the API never hard-fails.
- **Real embeddings**: Ollama embeddings (`nomic-embed-text`) when available, hashing vectorizer otherwise.
- **Real email engine**: sends via SMTP (Gmail/SendGrid/Resend/SES…). With no SMTP configured it composes + logs emails (so the workflow is functional in dev without spamming inboxes). AI-personalized or template-based.
- **Resume file upload**: PDF / DOCX / TXT parsed server-side.
- **AI screening interview**: native chat-based screening (adaptive questions → transcript → AI evaluation with communication/technical/confidence scores + recommendation). Inspired by the MIT-licensed FoloUp & aural-oss and the AutoScreen-FW rubric method — but built free in our own stack (no Retell/paid voice, no login). External tools evaluated; none were clean drop-ins (paid voice/LLM, AGPL, or SaaS), so the capability is native.
- **MCP server**: exposes 10 tools (`create_hiring_request`, `generate_job_description`, `ingest_candidate`, `get_pipeline`, `move_stage`, `start_screening`, `answer_screening`, `send_candidate_email`, `hiring_analytics`, `list_roles`).
- **Governance**: AI scores are suggestions — explainable, human-overridable, never auto-reject. Everything is written to an audit log.

## Tech stack

| Layer | Choice |
|---|---|
| Backend | FastAPI + SQLAlchemy 2.0 |
| DB | SQLite (dev) · PostgreSQL (prod, via Docker) |
| AI | Claude / Ollama / rule-based — over plain HTTP (`httpx`) |
| Email | SMTP (`smtplib`) with console+DB fallback |
| Frontend | React 19 + Vite + Tailwind v4 (light theme) |
| Agents | Model Context Protocol server (`mcp`) |
| Infra | Docker + docker-compose + nginx |

---

## Run it — option A: local dev

### Backend
```powershell
cd backend
python -m venv .venv; .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
pip install -r requirements-optional.txt   # PDF/DOCX parsing (optional)
uvicorn app.main:app --reload
```
API + docs → http://localhost:8000/docs

### Frontend
```powershell
cd frontend
npm install
npm run dev
```
App → http://localhost:5173

## Run it — option B: production stack (Docker)

```powershell
docker compose up --build
```
- App (nginx) → http://localhost:8080
- API → http://localhost:8000/docs
- Postgres with a persistent volume

Configure via env vars or a `.env` beside `docker-compose.yml` (see `backend/.env.example`).

## Run it — option C: deploy FREE on Render

This repo ships a [`render.yaml`](render.yaml) Blueprint that stands up the whole product on
Render's **free** tier (no credit card): managed Postgres + the FastAPI backend (API +
public careers pages + job-board feeds) + the React admin UI.

1. Push this repo to GitHub.
2. Go to **render.com → New → Blueprint**, connect the repo. Render reads `render.yaml`.
3. When prompted, paste your secrets: `OPENAI_API_KEY` (a free [Gemini key](https://aistudio.google.com/apikey)),
   `COMPANY_NAME`, `EMAIL_FROM`. Leave SMTP blank unless you have it.
4. After the **backend** goes live, copy its URL and set the **frontend's** `VITE_API_BASE`
   to `<backend-url>/api`, then redeploy the frontend.
5. Distribute jobs: the backend's `/careers/sitemap.xml` and `/careers/feed.xml` are live and
   crawlable — submit them to Google Search Console + the free aggregators (see the in-app
   **Distribution** page). `PUBLIC_BASE_URL` is auto-set from Render's URL.

> Free-tier caveats: web services sleep after ~15 min idle (first hit cold-starts in ~50s) and
> free Postgres is removed after ~30 days. Fine for launch/testing; upgrade to paid instances
> (~$7/mo each) for always-on production.

---

## Turn on the real integrations

| Capability | How |
|---|---|
| **Claude AI** | `set ANTHROPIC_API_KEY=sk-ant-...` (or in `.env`) |
| **Local open-source AI** | install [Ollama](https://ollama.com), `ollama pull llama3.1` and `ollama pull nomic-embed-text` |
| **Real email** | set `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM` (Gmail app password works) |

## Drive HR-OS from an AI agent (MCP)

```powershell
cd backend
pip install -r requirements-mcp.txt
python -m app.mcp_server
```
Add to Claude Desktop's `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "hr-os": {
      "command": "python",
      "args": ["-m", "app.mcp_server"],
      "cwd": "<absolute-path>/hr/backend"
    }
  }
}
```
Then ask Claude: *"Create a Senior Frontend Engineer role, generate the JD, and show me the pipeline."*

---

## Honest status / what's next for full production

Built & working: the full core loop, real AI/email/embeddings/file-parsing, MCP, Docker/Postgres, audit trail.

Intentionally deferred for now (basic HRMS first): **auth/login + RBAC**. Other future hardening: a **background job queue** (Celery/Redis for async email + re-scoring at scale), pgvector for large-scale vector search, additional channels (WhatsApp/Slack), and optional voice screening (LiveKit/Whisper) building on the chat screening already here.
