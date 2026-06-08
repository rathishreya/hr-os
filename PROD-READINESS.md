# HR-OS — Production Readiness

**Status: pilot-ready after the 2026-06-08 hardening pass.** The original audit found
launch-blocking gaps in 4 areas; most are now fixed in code (see "Implementation status"
below). The remaining gaps need either *external accounts* (object storage) or *large
redesigns* (Alembic, UUIDs, full per-record RBAC) and are called out explicitly.

## Implementation status (2026-06-08)

**✅ Done in code**
- **Authentication** — HMAC token login (`/api/auth/login`), an auth-gate middleware that
  protects every `/api/*` route except a public allowlist, a `current_user`/`require_roles`
  dependency, a bootstrap admin on first run, and a full frontend login + gated app + logout.
- **PII consent** — fixed the misleading "transcribed on your device" claim, added consent
  checkboxes to the interview intro and the careers apply form, and a GDPR delete endpoint
  (`DELETE /api/candidates/{id}`, admin/manager) that cascades across all the candidate's data.
- **Data export** — `GET /api/admin/export` (admin) + a Settings → Data tab to download a
  JSON backup, plus a free-tier "data is temporary" warning banner.
- **Reliability** — upload size caps (resume 25 MB, video 200 MB), a bound on the candidate
  list query, video transcription/evaluation moved to a **background task** (instant upload
  response), Postgres connection pooling (`pool_pre_ping`/`pool_recycle`).
- **Hardening** — CORS restricted to real methods/headers, `max_length` on key input schemas,
  `EMAIL_FROM`/`SMTP_USER` mismatch warning, `SECRET_KEY` default warning, `engines.node`/`.nvmrc`.
- **Deploy** (earlier) — single-service Render deploy; `PUBLIC_BASE_URL` auto-resolves.

**⏳ Deferred (need your accounts or a larger redesign — tracked below)**
- **Object storage for files** (P0 #2) — files are still DB BLOBs; needs an S3/Backblaze
  account. Mitigated by upload caps + the export endpoint + the warning banner.
- **UUID identifiers + full per-record RBAC + per-interview tokens** (P0 #1) — auth now gates
  all enumeration; these are defense-in-depth for multi-tenant scale.
- **Bulk-email retry queue + transactional provider** (P0 #4) — needs a background queue;
  1:1 + small bulk sends work today.
- **Alembic migrations** (P1), **at-rest column encryption** (P0 #3), **AI rate-limiting** &
  **lazy Whisper bundle** (P2).

**🔑 Operational (only you can do)** — set a strong `SECRET_KEY`, move to a paid Postgres,
and rotate the Gemini key + Gmail App Password before real production.

---

This document is the original prioritized fix list (kept for reference). Severity:
- **P0** — must fix before any real production use (data exposure, data loss, broken deploy).
- **P1** — important; fix before scaling or shortly after a guarded pilot.
- **P2** — hardening / polish.

Each item cites the relevant file(s).

---

## Verdict by dimension

| Dimension | Verdict |
|---|---|
| Authentication & authorization | 🔴 Blocker |
| Data persistence / file storage (Render free tier) | 🔴 Blocker |
| PII handling & consent | 🔴 Blocker |
| External integrations (email at scale) | 🔴 Blocker |
| Deployment configuration | 🟠 Needs work |
| Reliability, validation & error handling | 🟠 Needs work |
| Secrets & configuration hygiene | 🟢 Ready |
| Dependencies & build health | 🟢 Ready |
 
---

## 🔴 P0 — Blockers

### 1. No authentication or authorization on the API
The entire `/api/*` tree is open. Password hashing exists but is never used; there is no
login endpoint and no token/session check. Resource IDs are sequential integers, so they
are trivially enumerable.

- [ ] Add a login endpoint (`POST /api/auth/login`) that verifies email + password via the
      existing `verify_password()` in `backend/app/services/security.py` and issues a session token / JWT.
- [ ] Add a FastAPI auth dependency and apply it to every `/api/*` route **except** the
      intentionally public ones. Keep `/careers/*` public ([backend/app/routers/careers.py](backend/app/routers/careers.py) is correctly scoped to published jobs).
- [ ] Add role-based access control (recruiter / manager / admin / panellist) — e.g. only
      managers approve offers; panellists can't see full candidate pool or compensation.
- [ ] Protect candidate PII endpoints: `list_candidates`, `get_candidate`, `candidate_profile`,
      `resume-file` ([backend/app/routers/candidates.py](backend/app/routers/candidates.py)).
- [ ] Protect pipeline + stage changes ([backend/app/routers/pipeline.py](backend/app/routers/pipeline.py)) — note `move_stage` to "hired" auto-generates an offer letter.
- [ ] Protect document endpoints (generate / approve / download signed PDF) ([backend/app/routers/documents.py](backend/app/routers/documents.py)).
- [ ] Secure the video interview endpoints ([backend/app/routers/video.py](backend/app/routers/video.py)): issue a per-interview, time-bound token in the candidate link; require it on `answer` / `recording` / `get`. For recruiter-facing reads, require the normal auth.
- [ ] Switch externally-exposed identifiers from sequential ints to UUIDs (or signed tokens) to stop enumeration of resumes/videos/documents.

### 2. Data loss on Render's free tier
Hiring data will not survive on the free plan, and large files will exhaust it.

- [ ] **Files are stored as DB BLOBs** — `Candidate.resume_file`, `VideoInterview.recording`,
      `VideoAnswer.video`, `Document.upload_file`, `AssessmentFile.file` ([backend/app/models.py](backend/app/models.py)).
      Move them to object storage (S3 / Backblaze / Cloudinary / a Render persistent disk) and
      store only a URL/key. A 5-minute video is ~100–200 MB; the free Postgres cap is 5 GB.
- [ ] **Free Postgres is deleted ~30 days** and the filesystem is wiped on every redeploy.
      Document that the free tier is testing-only and require a paid DB for real hiring.
- [ ] Add a **data export/backup** endpoint (candidates, jobs, applications, interviews,
      documents as JSON/CSV/zip) — there is currently no recovery path.
- [ ] Add a UI banner on the free tier warning of the 30-day data deletion.

### 3. PII consent & a misleading privacy claim
- [ ] **Fix the false claim.** The interview screen says *"Your answers are transcribed
      privately on your device"* ([frontend/src/pages/VideoInterview.jsx](frontend/src/pages/VideoInterview.jsx)), but the backend
      falls back to uploading the video to Google Gemini if on-device transcription fails
      ([backend/app/routers/video.py](backend/app/routers/video.py), `_transcribe_gemini`). Either disable the Gemini fallback to
      keep the promise, or change the copy and add explicit consent.
- [ ] Add a **consent checkbox** to the careers/apply form ([backend/app/routers/careers.py](backend/app/routers/careers.py)) and the
      interview intro: data is stored, reviewed by the company, and processed by AI providers;
      link a privacy policy (what's collected, retention, third parties, data rights).
- [ ] Add a **data-deletion / retention** mechanism (candidate "delete my data" + a retention
      window). Required for GDPR/CCPA "right to be forgotten"; none exists today.
- [ ] (Recommended) Encrypt sensitive columns at rest (resumes, videos, compensation in
      `Candidate.parsed`) or rely on storage-layer encryption.

### 4. Email is not safe for bulk sending
1:1 sends work. Bulk does not.

- [ ] TPO outreach loops and sends emails sequentially through a **personal Gmail/Workspace
      account** ([backend/app/routers/outreach.py](backend/app/routers/outreach.py), [backend/app/services/mailer.py](backend/app/services/mailer.py)) — this hits Gmail's
      ~2/sec SMTP limit and bulk-use policy (spam flags / suspension risk). Move bulk mail to a
      transactional provider (Brevo 300/day, SendGrid 100/day) and/or a verified shared alias.
- [ ] Add a send queue with retry/backoff; distinguish transient vs permanent failures.
      Currently a failed send is marked `failed` and abandoned with no retry.

### 5. Rotate the shared secrets (operational)
- [ ] The Gemini API key and Gmail App Password were shared in chat / live on disk in
      `backend/.env`. Regenerate both before real production (the `.env` itself is correctly
      gitignored and was never committed).

---

## 🟠 P1 — Fix soon

### Reliability
- [ ] **No upload size limits** on video answer/recording ([backend/app/routers/video.py](backend/app/routers/video.py)) and the
      authenticated resume upload ([backend/app/routers/candidates.py](backend/app/routers/candidates.py)) — can OOM the 512 MB free
      instance. The `/careers/apply` path already enforces 10 MB; mirror that.
- [ ] **Unbounded candidate query** — `list_candidates` loads every resume_text/BLOB into
      memory and (in table mode) computes embeddings per row ([backend/app/routers/candidates.py](backend/app/routers/candidates.py)). Add pagination.
- [ ] **Blocking transcription + AI evaluation on the request thread** ([backend/app/routers/video.py](backend/app/routers/video.py))
      can exceed Render's ~30 s request limit and hang the candidate's browser. Move to a
      background task; return `202 Accepted` and let the UI poll.

### Deploy
- [ ] `VITE_API_BASE` is `sync: false` and silently falls back to `/api` ([frontend/src/api.js](frontend/src/api.js)),
      which breaks the split frontend/backend deploy on Render. Automate it or add a runtime
      config + a startup `/api/health` reachability check that warns if the backend is unreachable.

### Schema / DB
- [ ] Ad-hoc startup migrations (`_ensure_pg_columns`) run raw `ALTER TABLE` on every boot
      ([backend/app/database.py](backend/app/database.py)) — not safe for Postgres under concurrent starts. Move to Alembic,
      run once at deploy.
- [ ] Add SQLAlchemy pool settings (`pool_pre_ping=True`, `pool_recycle`) for unstable free PG.

### Security hardening
- [ ] CORS uses `allow_methods=['*']` + `allow_headers=['*']` with credentials ([backend/app/main.py](backend/app/main.py));
      restrict to the methods/headers actually used.
- [ ] Add CSRF protection on state-changing routes once auth/sessions exist.

### Email correctness
- [ ] Surface email send failures to the user — `mailer.compose` marks `failed` silently and
      the caller doesn't check ([backend/app/services/mailer.py](backend/app/services/mailer.py), [backend/app/routers/comms.py](backend/app/routers/comms.py)).
      (The Settings → Email "Send test" already surfaces status; extend that to real sends.)
- [ ] Validate `EMAIL_FROM` vs `SMTP_USER` for Gmail (alias must be verified or mail looks spoofed).
- [ ] Gemini free-tier 429s surface to candidates mid-interview ([backend/app/routers/video.py](backend/app/routers/video.py)).
      Prefer the on-device transcript; consider Groq for chat tasks (graceful mock fallback already exists for chat).

---

## 🟢 P2 — Nice to have / polish
- [ ] Add `max_length` constraints to Pydantic string fields ([backend/app/schemas.py](backend/app/schemas.py)).
- [ ] Rate-limit / quota-track AI provider calls ([backend/app/services/ai/provider.py](backend/app/services/ai/provider.py)); surface "degraded to mock" to the user.
- [ ] Defer video evaluation to a background task (same fix as the reliability item).
- [ ] Lazy-load the 23 MB Whisper WASM bundle only when the interview feature opens ([frontend/package.json](frontend/package.json)).
- [ ] Add `engines.node` / `.nvmrc` to the frontend for reproducible builds.
- [ ] Document Render free-tier limits (RAM, request timeout, idle sleep) in a deploy doc.

---

## 🟢 Already solid (no action needed)
- **Secrets hygiene** — `.env` is gitignored; no API keys, passwords, or default admin
  credentials are committed; verified via git history.
- **Dependencies & build** — pinned (`requirements-prod.txt`), frontend builds clean, the
  Postgres driver (`psycopg[binary]`) is present, resume-parsing deps degrade gracefully.
- **Password storage** — PBKDF2-HMAC-SHA256, 240k iterations, random salt, constant-time
  compare ([backend/app/services/security.py](backend/app/services/security.py)). (It's just never invoked yet — see P0 #1.)
- **Public careers pages** — correctly public and scoped to published jobs only.
- **Email engine** — works; 1:1 sending is fine (bulk is the concern above).

---

## Suggested sequencing

**Tier A — guarded internal pilot (smallest safe step):**
1. Add authentication (P0 #1) — even a single shared login gate is a huge improvement.
2. Cap upload sizes (P1) and fix the misleading interview copy + add consent (P0 #3).
3. Move to a paid Postgres and rotate secrets (P0 #2, #5).

**Tier B — real / public production:**
4. Full RBAC + per-interview tokens + UUID identifiers (P0 #1).
5. Object storage for files + data export (P0 #2).
6. Background tasks for transcription/evaluation; pagination (P1).
7. Bulk email via a transactional provider with a retry queue (P0 #4).
8. Alembic migrations, CORS tightening, CSRF, deploy automation (P1).
