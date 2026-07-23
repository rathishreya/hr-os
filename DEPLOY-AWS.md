# HR-OS — AWS Deployment Runbook (DevOps handoff)

Single-container web app (FastAPI + bundled React UI) currently running on Render; this document
covers moving it to AWS. **RDS Postgres already exists** (us-east-1). New AWS pieces: the compute
service, an **S3** bucket (interview recordings), and **SES** (email).

> ⚠️ **Secrets:** the values marked `‹secret — from app owner›` below must be stored in **AWS
> Secrets Manager** or **SSM Parameter Store** and injected as env vars — do **not** hard-code them
> in task definitions or commit them to git. The app owner will provide the current values.

---

## 1. Architecture

- **One Docker image** builds the React UI and runs FastAPI, which serves the **API + admin UI +
  public pages** (careers, candidate video-interview) from a **single origin**. No separate frontend
  host, no CORS wiring for the main app.
- **Container port:** `8000` · **Health check:** `GET /api/health` → `200 {"status":"ok"}`
- **Dockerfile:** `backend/Dockerfile` · **Build context:** repo root (`.`)
- Python 3.12, uvicorn. The built UI is baked into the image at `/srv/static`
  (`FRONTEND_DIST_DIR` is set in the Dockerfile — do not override).

```mermaid
flowchart LR
  U[Users / Candidates] -->|HTTPS| LB[ALB / App Runner]
  LB --> C[HR-OS container :8000<br/>FastAPI + React UI]
  C -->|SQL over TLS| RDS[(RDS Postgres<br/>us-east-1)]
  C -->|SES API HTTPS| SES[Amazon SES]
  C -->|S3 API HTTPS| S3[(S3 bucket<br/>recordings)]
  C -->|HTTPS| GEM[Gemini API]
```

---

## 2. Compute — recommended options

Any of these run the image; pick per team preference:

| Option | Notes |
|---|---|
| **AWS App Runner** (simplest) | Point at ECR image or connect the repo. Auto HTTPS + URL. Port 8000, health `/api/health`. Attach an **instance role** for S3/SES. |
| **ECS Fargate + ALB** | Most control. Task role for S3/SES; ALB health check `/api/health`; target port 8000. |
| **Elastic Beanstalk (Docker)** | Single-container platform; health `/api/health`. |

**Sizing:** **≥ 1 vCPU / 2 GB RAM.** (512 MB is too small — it OOM'd on résumé parsing + video.)
Start with 1 instance; scale horizontally later (the app is stateless — all state is in RDS/S3).

**Build & push (ECR example):**
```bash
# from repo root
docker build -f backend/Dockerfile -t hr-os:latest .
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <acct>.dkr.ecr.us-east-1.amazonaws.com
docker tag hr-os:latest <acct>.dkr.ecr.us-east-1.amazonaws.com/hr-os:latest
docker push <acct>.dkr.ecr.us-east-1.amazonaws.com/hr-os:latest
```

---

## 3. AWS resources to create

### 3a. S3 bucket (interview recordings)
- Create bucket (e.g. `hrms-ez-interviews`), **us-east-1**, **Block all public access: ON**
  (recordings are candidate PII; the app serves them via short-lived presigned URLs).

### 3b. SES (email)
1. **Verify the domain** `ezworks.io` in SES (us-east-1) → add the **3 DKIM CNAME** records SES
   provides to the domain's DNS (GoDaddy). Wait for **Verified**.
2. **Request production access** (move out of the SES **sandbox**) — until approved, SES only
   sends to verified addresses. Usually approved within a day.
3. Sender is `EMAIL_FROM=shweta.dwivedi@ezworks.io` (must be on the verified domain).

### 3c. IAM permissions for the compute role
Attach this policy to the **instance/task role** (App Runner instance role, ECS task role, or EC2
instance profile). With a role attached, **no access keys are needed in env** — boto3 uses the role.
```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::hrms-ez-interviews/*" },
    { "Effect": "Allow",
      "Action": ["ses:SendRawEmail", "ses:SendEmail"],
      "Resource": "*" }
  ]
}
```
> If the platform can't attach a role, create an IAM **user** with the same policy and set
> `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` in the env instead.

### 3d. RDS (already exists)
- Endpoint: `new-dev-database.c9jc4nmtmlj7.us-east-1.rds.amazonaws.com:5432`, db `hrms_db`, user `hrms_user`.
- **Recommended hardening:** put the compute in the **same VPC** and use the RDS **private**
  endpoint + a security group that only allows the app's SG on 5432 (today RDS is publicly
  reachable with a weak password — see §6).

---

## 4. Environment variables

Set these on the compute service. Non-secret values are shown; secrets come from the owner /
Secrets Manager.

### Required — core
| Var | Value | Notes |
|---|---|---|
| `DATABASE_URL` | `postgresql+psycopg://hrms_user:‹secret›@new-dev-database.c9jc4nmtmlj7.us-east-1.rds.amazonaws.com:5432/hrms_db?sslmode=require` | Password is `‹secret›`. Use the private host if same-VPC. |
| `SECRET_KEY` | `‹secret — from app owner›` | **Reuse the existing value exactly** — changing it logs out all users and breaks signed links/interview codes. |
| `PUBLIC_BASE_URL` | `https://‹your-app-url›` | **Must be set** (Render injected this automatically; AWS does not). The app's public URL, no trailing slash. Interview/assessment/meeting links depend on it. |
| `FRONTEND_ORIGIN` | `https://‹your-app-url›` | Same URL. For CORS on cross-origin API calls. |

### Required — AI (résumé parsing, interview evaluation)
| Var | Value |
|---|---|
| `AI_PROVIDER` | `auto` |
| `OPENAI_API_KEY` | `‹secret — Gemini API key›` |
| `OPENAI_BASE_URL` | `https://generativelanguage.googleapis.com/v1beta/openai` |
| `OPENAI_MODEL` | `gemini-2.5-flash` |
| `OPENAI_JSON_MODE` | `false` |
| `EMBEDDINGS_PROVIDER` | `hash` |

### Email — Amazon SES
| Var | Value | Notes |
|---|---|---|
| `EMAIL_PROVIDER` | `ses` | **Set to `ses` only after** the domain is Verified **and** out of the sandbox. Before that, leave blank and set `SENDGRID_API_KEY` so email still works. |
| `EMAIL_FROM` | `shweta.dwivedi@ezworks.io` | Must be on the SES-verified domain. |
| `EMAIL_FROM_NAME` | `EZ People` | Sender display name. |
| `SES_REGION` | `us-east-1` | |
| `SENDGRID_API_KEY` | `‹secret›` *(optional)* | Fallback provider; used only when `EMAIL_PROVIDER` ≠ `ses`. Remove once SES is confirmed. |

### Storage — S3
| Var | Value |
|---|---|
| `S3_BUCKET` | `hrms-ez-interviews` |
| `AWS_REGION` | `us-east-1` |

### AWS credentials — only if NOT using an instance/task role
| Var | Value |
|---|---|
| `AWS_ACCESS_KEY_ID` | `‹secret›` |
| `AWS_SECRET_ACCESS_KEY` | `‹secret›` |

### Optional
| Var | Value | Notes |
|---|---|---|
| `COMPANY_NAME` | `EZ Works` | Shown on careers pages + emails. |
| `COMPANY_COUNTRY` | `India` | |
| `ALLOW_SIGNUP` | `true` | Self-signup on/off. |
| `SIGNUP_DEFAULT_ROLE` | `recruiter` | New users' role (never admin). |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | *(unset)* | Only used to bootstrap the first admin on a fresh DB; not needed here (DB already has users). |

**Do NOT set** `FRONTEND_DIST_DIR` (baked into the image) or `RENDER_EXTERNAL_URL` (Render-only).

---

## 5. Deploy sequence

1. Create S3 bucket (§3a) and finish SES verification + sandbox exit (§3b). *(SES can be done in
   parallel; until it's ready, deploy with `SENDGRID_API_KEY` set and `EMAIL_PROVIDER` blank.)*
2. Create the compute service from the image, with the IAM role (§3c) and env vars (§4).
   You won't know the public URL yet — deploy once, then set `PUBLIC_BASE_URL`/`FRONTEND_ORIGIN`
   to the assigned URL (or your custom domain) and redeploy.
3. On boot the app auto-runs an idempotent schema migration (`ALTER TABLE … ADD COLUMN IF NOT
   EXISTS`). No manual migration step. (Requires the DB user to own the tables — `hrms_user` does.)
4. Point DNS (Route 53 / your registrar) at the ALB / App Runner URL if using a custom domain.

---

## 6. Post-deploy verification

```bash
# 1. Health — expect {"status":"ok",...}
curl -s https://‹your-app-url›/api/health

# 2. Auth gate works — expect 401 (no token)
curl -s -o /dev/null -w "%{http_code}\n" https://‹your-app-url›/api/pipeline/board
```
Then in the UI: **log in** → **Settings → send a test email** (confirms SES) → open a role,
schedule an **AI-interview round**, take a short test interview → confirm the recording plays
(confirms S3 upload + presigned playback).

---

## 7. Security / hardening notes

- **Secrets** → AWS Secrets Manager or SSM Parameter Store; inject as env. Never in the image or git.
- **RDS** is currently **publicly accessible with a weak password**. Move it to a private subnet,
  restrict the security group to the app's SG on 5432, and rotate `hrms_user`'s password (update
  `DATABASE_URL` accordingly).
- **Rotate** any credential that has been shared over chat/email during migration: `SECRET_KEY`
  can't be rotated without logging users out, but the Gemini key, SendGrid key, and DB password can
  and should be. (Rotating `OPENAI_API_KEY` is safe and recommended.)
- Prefer an **IAM role** on the compute over long-lived access keys.
- TLS terminates at the ALB / App Runner; the container serves plain HTTP on 8000 behind it.

---

## 8. Quick reference

| Item | Value |
|---|---|
| Container port | `8000` |
| Health check | `GET /api/health` |
| Dockerfile | `backend/Dockerfile` (build context = repo root) |
| Min resources | 1 vCPU / 2 GB RAM |
| Region | `us-east-1` (RDS, SES, S3 all here) |
| Runtime | Python 3.12 / uvicorn (stateless; scale horizontally) |
| Schema migrations | Automatic on startup (idempotent) |
