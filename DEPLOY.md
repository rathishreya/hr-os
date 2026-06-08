# Deploying HR-OS (free, one service)

HR-OS now deploys as a **single Render service**: one Docker image builds the React UI
and runs FastAPI, which serves the admin UI, the API, and the public careers pages from
**one URL**. No separate static host, no `VITE_API_BASE` to wire, no CORS to configure.

## What I (the app) have already set up
- ✅ `render.yaml` Blueprint — one web service + free Postgres.
- ✅ Multi-stage `backend/Dockerfile` — builds the frontend, then serves it from FastAPI.
- ✅ `PUBLIC_BASE_URL` auto-resolves from Render's `RENDER_EXTERNAL_URL`, so careers
  feeds and the Google Indexing push work the moment it's live.
- ✅ All credential slots pre-declared as prompts (`sync: false`) — you just paste values.

## What only you can do (needs your accounts / a browser)
1. **Push to GitHub** (if not already): the repo must be on GitHub for Render to read it.
2. **Create the Render service** — render.com → **New → Blueprint** → pick this repo →
   **Apply**. Render reads `render.yaml` and provisions everything.
3. **Paste the prompted values** (see table). Only the first two are needed to start.
4. **Open the service URL** — that's your live app. Copy it; it's your public base URL.

## Environment values Render will prompt for

| Key | Needed? | Where to get it |
|---|---|---|
| `OPENAI_API_KEY` | **Yes** | Free Gemini key — https://aistudio.google.com/apikey |
| `COMPANY_NAME` | **Yes** | e.g. `EZ Works` |
| `COMPANY_WEBSITE` | optional | e.g. `https://www.ez.works` |
| `EMAIL_FROM` / `EMAIL_FROM_NAME` | optional | sender identity for candidate emails |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASSWORD` | optional | real email — e.g. Gmail/Workspace (`smtp.gmail.com`, your address, an App Password) |
| `GOOGLE_INDEXING_SA_JSON` | optional | Google for Jobs auto-index — paste a GCP service-account JSON (enable Indexing API + verify your domain in Search Console) |
| `LINKEDIN_ACCESS_TOKEN` / `LINKEDIN_ORG_URN` | optional | LinkedIn company-page auto-share (developer app, `w_organization_social`, page admin) |

Everything optional can be added **later** in the service's **Environment** tab — the app
runs fine without them (email logs instead of sends; direct posting stays a no-op).

## After it's live
- **Distribution page** shows your feed URLs and the automated-posting status. Submit
  `/<your-url>/careers/sitemap.xml` to Google Search Console and the feed URL to the free
  aggregators (Adzuna, Jooble, etc.) — one-time, per board.
- **Free-tier caveats:** the service sleeps after ~15 min idle (≈50s cold start) and the
  free Postgres is deleted after ~30 days. Upgrade to paid (~$7/mo each) for real use, and
  see `PROD-READINESS.md` before handling real candidate data (notably: add authentication).

## Local development (unchanged)
Run the backend (`uvicorn app.main:app`) and the Vite dev server (`npm run dev`) separately;
Vite serves the UI on :5173 and proxies `/api` + `/careers` to the backend on :8000. The
single-service serving only kicks in when a built `frontend/dist` is present.
