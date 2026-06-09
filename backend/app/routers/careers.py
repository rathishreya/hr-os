"""Public careers pages — server-rendered HTML with schema.org JobPosting structured
data so Google for Jobs (and other crawlers) can index published roles automatically.

These routes are intentionally public (no /api prefix, no auth) and only expose jobs
whose status is 'published'.
"""
from __future__ import annotations

import html as _html
import json
import re
from datetime import date, datetime, timezone
from email.utils import format_datetime

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from fastapi.responses import HTMLResponse, JSONResponse, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models
from ..config import settings
from ..database import get_db
from ..services import recruitment, resume_parser

router = APIRouter(tags=["careers"])

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

# Where a public applicant came from. The apply link carries a ?src= tag (e.g. the
# "Apply on LinkedIn" link is /careers/{id}/apply?src=linkedin) so an applicant lands
# in the pipeline already attributed to the channel that referred them. Whitelisted so
# a crafted query param can't inject an arbitrary source string into the data.
_KNOWN_SOURCES = {
    "careers", "linkedin", "indeed", "naukri", "referral",
    "google", "adzuna", "twitter", "facebook", "instagram",
}


def _norm_source(src: str) -> str:
    s = (src or "").strip().lower()
    return s if s in _KNOWN_SOURCES else "careers"


_MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB cap on public résumé uploads


def _e(text) -> str:
    return _html.escape(str(text or ""))


def _cdata(text) -> str:
    """Wrap text in a CDATA section, neutralising any embedded ']]>' terminator."""
    return f"<![CDATA[{str(text or '').replace(']]>', ']]]]><![CDATA[>')}]]>"


def _base_url(request: Request) -> str:
    """Absolute origin used in feeds. Prefers the configured public URL (required by
    aggregators in prod); falls back to the request host for local previewing."""
    return settings.PUBLIC_BASE_URL or str(request.base_url).rstrip("/")


def _published(db: Session) -> list[models.Job]:
    return db.scalars(
        select(models.Job).where(models.Job.status == "published").order_by(models.Job.created_at.desc())
    ).all()


def _date_posted(job: models.Job) -> str:
    dt = job.created_at or datetime.now(timezone.utc)
    return dt.date().isoformat() if isinstance(dt, datetime) else str(dt)


def _valid_through(hr: models.HiringRequest) -> str | None:
    d = (hr.hiring_deadline or "").strip()
    return d if _DATE_RE.match(d) else None


# ── Lightweight, SAFE formatting subset (bold/italic/underline + nested bullets) ──
# Everything is HTML-escaped first, then only these known tokens become tags, so no
# user input can inject markup. Matches the editor toolbar in the frontend.
_BOLD = re.compile(r"\*\*(.+?)\*\*")
_UNDER = re.compile(r"__(.+?)__")
_ITAL = re.compile(r"\*([^*\n]+?)\*")


def _fmt_inline(text: str) -> str:
    s = _e(text)
    s = _BOLD.sub(r"<strong>\1</strong>", s)
    s = _UNDER.sub(r"<u>\1</u>", s)
    s = _ITAL.sub(r"<em>\1</em>", s)
    return s


def _render_list(items) -> str:
    """Render a list of line-strings as a (one-level) nested <ul>. An item indented by
    2+ spaces nests under the previous top-level item; leading '- '/'* ' is stripped."""
    items = [str(i) for i in (items or []) if str(i).strip()]
    if not items:
        return ""
    out: list[str] = ["<ul>"]
    li_open = sub_open = False
    for it in items:
        indent = len(it) - len(it.lstrip())
        body = it.strip()
        if body[:2] in ("- ", "* "):
            body = body[2:].strip()
        content = _fmt_inline(body)
        if indent >= 2:
            if not sub_open:
                out.append("<ul>")
                sub_open = True
            out.append(f"<li>{content}</li>")
        else:
            if sub_open:
                out.append("</ul>")
                sub_open = False
            if li_open:
                out.append("</li>")
            out.append(f"<li>{content}")
            li_open = True
    if sub_open:
        out.append("</ul>")
    if li_open:
        out.append("</li>")
    out.append("</ul>")
    return "".join(out)


def _markdown_block(text: str) -> str:
    """Render free text: blank line = paragraph break, '- '/'* ' lines = bullets
    (2-space indent = sub-bullet), everything else = paragraph. Inline formatting applied."""
    out: list[str] = []
    depth = 0

    def close_to(target: int) -> None:
        nonlocal depth
        while depth > target:
            out.append("</ul>")
            depth -= 1

    for raw in str(text or "").split("\n"):
        line = raw.rstrip()
        if not line.strip():
            close_to(0)
            continue
        m = re.match(r"^(\s*)[-*]\s+(.*)$", line)
        if m:
            want = 2 if len(m.group(1)) >= 2 else 1
            while depth < want:
                out.append("<ul>")
                depth += 1
            close_to(want)
            out.append(f"<li>{_fmt_inline(m.group(2).strip())}</li>")
        else:
            close_to(0)
            out.append(f"<p>{_fmt_inline(line.strip())}</p>")
    close_to(0)
    return "".join(out)


def _description_html(job: models.Job) -> str:
    parts: list[str] = []
    if job.description:
        parts.append(_markdown_block(job.description))

    def section(title: str, items) -> None:
        body = _render_list(items)
        if body:
            parts.append(f"<h3>{_e(title)}</h3>{body}")

    section("Responsibilities", job.responsibilities)
    section("Requirements", job.requirements)
    section("Benefits", job.benefits)
    about = settings.COMPANY_ABOUT or job.company_description
    if about:
        # Preserve paragraph/line breaks (the About block carries multi-line links).
        parts.append(f"<h3>About {_e(settings.COMPANY_NAME)}</h3><p>{_e(about).replace(chr(10), '<br>')}</p>")
    if job.culture:
        parts.append(f"<h3>Culture</h3><p>{_e(job.culture)}</p>")
    return "".join(parts)


def _job_posting_ld(job: models.Job) -> dict:
    hr = job.hiring_request
    ld: dict = {
        "@context": "https://schema.org/",
        "@type": "JobPosting",
        "title": job.title or (hr.position if hr else "Job"),
        "description": _description_html(job),
        "datePosted": _date_posted(job),
        "employmentType": "FULL_TIME",
        "hiringOrganization": {"@type": "Organization", "name": settings.COMPANY_NAME},
        "identifier": {"@type": "PropertyValue", "name": settings.COMPANY_NAME, "value": str(job.id)},
        "directApply": False,
    }
    if hr:
        valid = _valid_through(hr)
        if valid:
            ld["validThrough"] = valid
        ld["jobLocation"] = {
            "@type": "Place",
            "address": {
                "@type": "PostalAddress",
                "addressLocality": hr.location or "",
                "addressCountry": "IN",
            },
        }
        if (hr.work_mode or "").lower() == "remote":
            ld["jobLocationType"] = "TELECOMMUTE"
            ld["applicantLocationRequirements"] = {"@type": "Country", "name": "India"}
        sal = hr.suggested_salary or {}
        if sal.get("min"):
            value: dict = {
                "@type": "QuantitativeValue",
                "minValue": sal.get("min"),
                "unitText": "YEAR",
            }
            if sal.get("max"):
                value["maxValue"] = sal.get("max")
            ld["baseSalary"] = {
                "@type": "MonetaryAmount",
                "currency": sal.get("currency") or "INR",
                "value": value,
            }
    return ld


def _ld_script(ld: dict) -> str:
    # Escape '<' to avoid breaking out of the <script> context.
    return json.dumps(ld, default=str).replace("<", "\\u003c")


_STYLE = """
:root{--brand:#7c3aed;--ink:#1f2430;--muted:#64748b;--line:#e2e8f0;--bg:#f6f7fb}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);
font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;line-height:1.6}
.wrap{max-width:760px;margin:0 auto;padding:32px 20px 64px}
.top{display:flex;align-items:center;gap:10px;margin-bottom:28px}
.logo{width:38px;height:38px;border-radius:10px;background:linear-gradient(135deg,#7c3aed,#d946ef);
color:#fff;font-weight:800;display:flex;align-items:center;justify-content:center}
.card{background:#fff;border:1px solid var(--line);border-radius:18px;padding:28px;
box-shadow:0 1px 3px rgba(0,0,0,.05)}
h1{font-size:28px;margin:0 0 6px;letter-spacing:-.5px}
.sub{color:var(--muted);font-size:14px;margin:0 0 18px}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 8px}
.chip{font-size:12px;font-weight:600;background:#ede9fe;color:#6d28d9;border-radius:999px;padding:4px 12px}
.chip.alt{background:#f1f5f9;color:#475569}
h3{font-size:15px;margin:22px 0 8px}ul{margin:0;padding-left:20px}li{margin:4px 0}
p{margin:10px 0}.apply{display:inline-block;margin-top:24px;background:var(--brand);color:#fff;
text-decoration:none;font-weight:600;padding:12px 22px;border-radius:12px}
.apply:hover{background:#6d28d9}.foot{color:var(--muted);font-size:12px;margin-top:28px;text-align:center}
a.jobcard{display:block;text-decoration:none;color:inherit;margin-bottom:12px}
a.jobcard .card{transition:border-color .15s,box-shadow .15s}
a.jobcard:hover .card{border-color:#c4b5fd;box-shadow:0 4px 14px rgba(124,58,237,.08)}
.muted{color:var(--muted);font-size:13px}
.jobrow{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:12px;
transition:border-color .15s,box-shadow .15s}
.jobrow:hover{border-color:#c4b5fd;box-shadow:0 4px 14px rgba(124,58,237,.08)}
.rowtitle{font-size:18px;font-weight:600;color:var(--ink);text-decoration:none}
.rowtitle:hover{color:var(--brand)}
.applysm{flex-shrink:0;background:var(--brand);color:#fff;text-decoration:none;font-weight:600;
font-size:13px;padding:9px 18px;border-radius:10px;white-space:nowrap}
.applysm:hover{background:#6d28d9}
.field{margin:16px 0}
label.lbl{display:block;font-size:13px;font-weight:600;color:#334155;margin:0 0 6px}
label.lbl .req{color:#e11d48}
.hint{font-size:12px;color:var(--muted);margin:4px 0 0}
input.inp,textarea.inp,select.inp{width:100%;border:1px solid var(--line);border-radius:10px;padding:10px 12px;
font-size:14px;font-family:inherit;color:var(--ink);background:#fff;outline:none}
input.inp:focus,textarea.inp:focus,select.inp:focus{border-color:var(--brand);box-shadow:0 0 0 3px rgba(124,58,237,.12)}
input[type=file].inp{padding:8px}
textarea.inp{resize:vertical}
.err{background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;border-radius:10px;padding:10px 12px;font-size:13px;margin:0 0 16px}
button.apply{border:0;cursor:pointer;font-size:15px}
.back{display:inline-block;margin-bottom:16px;color:var(--brand);text-decoration:none;font-size:13px;font-weight:600}
.back:hover{text-decoration:underline}
.success{width:46px;height:46px;border-radius:50%;background:#dcfce7;color:#16a34a;display:flex;
align-items:center;justify-content:center;font-size:24px;font-weight:800;margin:0 0 14px}
"""


def _page(title: str, body: str, head_extra: str = "") -> str:
    return f"""<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{_e(title)}</title><style>{_STYLE}</style>{head_extra}</head>
<body><div class="wrap">
<div class="top"><div class="logo">{_e((settings.COMPANY_NAME or 'H')[0])}</div>
<strong>{_e(settings.COMPANY_NAME)} — Careers</strong></div>
{body}
<div class="foot">Published via HR-OS · structured for Google for Jobs</div>
</div></body></html>"""


@router.get("/careers", response_class=HTMLResponse)
def careers_index(request: Request, db: Session = Depends(get_db)):
    jobs = _published(db)
    if not jobs:
        body = '<div class="card"><h1>No open roles right now</h1><p class="muted">Check back soon.</p></div>'
        return HTMLResponse(_page(f"Careers — {settings.COMPANY_NAME}", body))
    cards = []
    for j in jobs:
        hr = j.hiring_request
        meta = " · ".join(filter(None, [hr.location if hr else "", (hr.work_mode if hr else ""), hr.department if hr else ""]))
        cards.append(
            f'<div class="card jobrow">'
            f'<div style="min-width:0">'
            f'<a class="rowtitle" href="/careers/{j.id}">{_e(j.title or (hr.position if hr else "Role"))}</a>'
            f'<div class="muted" style="margin-top:4px">{_e(meta)}</div>'
            f'</div>'
            f'<a class="applysm" href="/careers/{j.id}/apply">Apply →</a>'
            f'</div>'
        )
    body = f'<h1 style="margin-bottom:18px">Open roles ({len(jobs)})</h1>{"".join(cards)}'
    return HTMLResponse(_page(f"Careers — {settings.COMPANY_NAME}", body))


@router.get("/careers/{job_id}.json")
def career_structured_data(job_id: int, db: Session = Depends(get_db)):
    """Raw JobPosting structured data (handy to test in Google's Rich Results tool).

    Declared BEFORE the HTML route so `/careers/5.json` matches here rather than being
    parsed as an int job_id by the page route.
    """
    job = db.get(models.Job, job_id)
    if not job or job.status != "published":
        return JSONResponse({"error": "not found or not published"}, status_code=404)
    return JSONResponse(_job_posting_ld(job))


# ───────────────────────── Free job-board distribution ──────────────────────
# A standard job feed (the de-facto "source/job" XML that Indeed, Adzuna, Jooble,
# Careerjet, Talent.com, Jora, WhatJobs … all ingest) + an RSS mirror + a sitemap.
# Register the feed URL once with each free aggregator and they crawl it on a
# schedule — no paid API, no ToS-violating bots. See GET /api/distribution/channels.

def _salary_text(hr: models.Job | None) -> str:
    if not hr:
        return ""
    sal = hr.suggested_salary or {}
    if sal.get("min"):
        cur = sal.get("currency") or "INR"
        rng = f"{sal['min']}-{sal['max']}" if sal.get("max") else f"{sal['min']}"
        return f"{cur} {rng} per year"
    return (hr.budget_ctc or "").strip()


def _job_xml(job: models.Job, base: str) -> str:
    hr = job.hiring_request
    title = job.title or (hr.position if hr else "Role")
    url = f"{base}/careers/{job.id}"
    location = (hr.location if hr else "") or ""
    remote = "Yes" if hr and (hr.work_mode or "").lower() == "remote" else "No"
    exp = ""
    if hr and (hr.yoe_min or hr.yoe_max):
        exp = f"{int(hr.yoe_min or 0)}-{int(hr.yoe_max or 0)} years"
    fields = {
        "title": title,
        "date": format_datetime(job.created_at or datetime.now(timezone.utc)),
        "referencenumber": str(job.id),
        "requisitionid": str(job.id),
        "url": url,
        "company": settings.COMPANY_NAME,
        "city": location,
        "country": settings.COMPANY_COUNTRY,
        "description": _description_html(job),
        "salary": _salary_text(hr),
        "jobtype": "fulltime",
        "category": (hr.department if hr else "") or "",
        "remote": remote,
        "experience": exp,
        "applyurl": url,
    }
    inner = "".join(f"<{k}>{_cdata(v)}</{k}>" for k, v in fields.items() if v != "")
    return f"<job>{inner}</job>"


@router.get("/careers/feed.xml")
def jobs_feed(request: Request, db: Session = Depends(get_db)):
    """Standard aggregator XML feed of all published roles (Indeed/Adzuna/Jooble/…)."""
    base = _base_url(request)
    jobs = _published(db)
    body = "".join(_job_xml(j, base) for j in jobs)
    xml = (
        '<?xml version="1.0" encoding="utf-8"?>\n<source>'
        f"<publisher>{_cdata(settings.COMPANY_NAME)}</publisher>"
        f"<publisherurl>{_cdata(settings.COMPANY_WEBSITE or base)}</publisherurl>"
        f"<lastBuildDate>{_cdata(format_datetime(datetime.now(timezone.utc)))}</lastBuildDate>"
        f"{body}</source>"
    )
    return Response(content=xml, media_type="application/xml")


@router.get("/careers/rss.xml")
def jobs_rss(request: Request, db: Session = Depends(get_db)):
    """RSS 2.0 mirror of the job feed (for readers / boards that prefer RSS)."""
    base = _base_url(request)
    items = []
    for j in _published(db):
        hr = j.hiring_request
        link = f"{base}/careers/{j.id}"
        items.append(
            "<item>"
            f"<title>{_cdata(j.title or (hr.position if hr else 'Role'))}</title>"
            f"<link>{_e(link)}</link>"
            f'<guid isPermaLink="true">{_e(link)}</guid>'
            f"<pubDate>{_e(format_datetime(j.created_at or datetime.now(timezone.utc)))}</pubDate>"
            f"<description>{_cdata(_description_html(j))}</description>"
            "</item>"
        )
    xml = (
        '<?xml version="1.0" encoding="utf-8"?>\n<rss version="2.0"><channel>'
        f"<title>{_cdata(settings.COMPANY_NAME + ' — Careers')}</title>"
        f"<link>{_e(base + '/careers')}</link>"
        f"<description>{_cdata('Open roles at ' + settings.COMPANY_NAME)}</description>"
        f"<lastBuildDate>{_e(format_datetime(datetime.now(timezone.utc)))}</lastBuildDate>"
        f"{''.join(items)}</channel></rss>"
    )
    return Response(content=xml, media_type="application/rss+xml")


@router.get("/careers/sitemap.xml")
def careers_sitemap(request: Request, db: Session = Depends(get_db)):
    """Sitemap of careers pages — submit in Google Search Console so Google for Jobs
    (and Indeed's crawler) discover new roles fast."""
    base = _base_url(request)
    urls = [f"<url><loc>{_e(base)}/careers</loc><changefreq>daily</changefreq></url>"]
    for j in _published(db):
        urls.append(
            f"<url><loc>{_e(base)}/careers/{j.id}</loc>"
            f"<lastmod>{_e(_date_posted(j))}</lastmod></url>"
        )
    xml = (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
        f"{''.join(urls)}</urlset>"
    )
    return Response(content=xml, media_type="application/xml")


def _channels(base: str) -> list[dict]:
    feed = f"{base}/careers/feed.xml"
    rss = f"{base}/careers/rss.xml"
    sitemap = f"{base}/careers/sitemap.xml"
    careers = f"{base}/careers"
    return [
        {
            "key": "google_jobs", "name": "Google for Jobs", "free": True,
            "method": "Structured data (JSON-LD)", "auto": True, "needs": "careers page",
            "submit_url": "https://search.google.com/search-console",
            "submit_value": sitemap,
            "note": "Already wired — every published role carries schema.org JobPosting data. "
                    "Submit the sitemap in Search Console so Google indexes new roles within hours.",
        },
        {
            "key": "indeed", "name": "Indeed", "free": True,
            "method": "Crawls your public careers site", "auto": True, "needs": "careers page",
            "submit_url": "https://www.indeed.com/hire/free-job-posting",
            "submit_value": careers,
            "note": "Indeed still scrapes public career sites for free (their free single-source "
                    "XML feed retires 2026). Keep the careers page public and roles appear organically.",
        },
        {
            "key": "adzuna", "name": "Adzuna", "free": True,
            "method": "Free organic XML feed", "auto": False, "needs": "feed",
            "submit_url": "https://www.adzuna.com/hire",
            "submit_value": feed,
            "note": "Adzuna advertises your organic jobs for free from an XML feed. Send them this feed URL.",
        },
        {
            "key": "jooble", "name": "Jooble", "free": True,
            "method": "Free publisher XML feed", "auto": False, "needs": "feed",
            "submit_url": "https://jooble.org/employers",
            "submit_value": feed,
            "note": "Apply to Jooble's publisher program and register this feed URL.",
        },
        {
            "key": "careerjet", "name": "Careerjet", "free": True,
            "method": "Free publisher XML feed", "auto": False, "needs": "feed",
            "submit_url": "https://www.careerjet.com/partners/",
            "submit_value": feed,
            "note": "Careerjet aggregates partner feeds for free — register this feed URL.",
        },
        {
            "key": "talent", "name": "Talent.com", "free": True,
            "method": "Free organic XML feed", "auto": False, "needs": "feed",
            "submit_url": "https://www.talent.com/employers",
            "submit_value": feed,
            "note": "Submit this feed URL for free organic listings (sponsored slots are optional/paid).",
        },
        {
            "key": "jora", "name": "Jora", "free": True,
            "method": "Free job posting / feed", "auto": False, "needs": "feed",
            "submit_url": "https://employer.jora.com/",
            "submit_value": feed,
            "note": "Jora (SEEK) offers free postings; for bulk, register this feed URL.",
        },
        {
            "key": "whatjobs", "name": "WhatJobs", "free": True,
            "method": "Free publisher XML feed", "auto": False, "needs": "feed",
            "submit_url": "https://www.whatjobs.com/employer",
            "submit_value": feed,
            "note": "Register this feed URL with WhatJobs' free organic program.",
        },
    ]


@router.get("/api/distribution/channels")
def distribution_channels(request: Request, db: Session = Depends(get_db)):
    """Everything the UI needs to distribute roles for free: the feed/sitemap URLs and
    the list of free aggregators with where to register them."""
    base = _base_url(request)
    jobs = _published(db)
    is_public = bool(settings.PUBLIC_BASE_URL) or not (
        "localhost" in base or "127.0.0.1" in base
    )
    roles = []
    for j in jobs:
        hr = j.hiring_request
        roles.append({
            "id": j.id,
            "title": j.title or (hr.position if hr else "Role"),
            "location": (hr.location if hr else "") or "",
            "work_mode": (hr.work_mode if hr else "") or "",
            "department": (hr.department if hr else "") or "",
            "url": f"{base}/careers/{j.id}",
            "json_url": f"{base}/careers/{j.id}.json",
            "date_posted": _date_posted(j),
            "distribution": j.distribution or {},
        })
    return {
        "base_url": base,
        "is_public": is_public,
        "company": settings.COMPANY_NAME,
        "published_count": len(jobs),
        "feeds": {
            "careers": f"{base}/careers",
            "xml": f"{base}/careers/feed.xml",
            "rss": f"{base}/careers/rss.xml",
            "sitemap": f"{base}/careers/sitemap.xml",
        },
        "roles": roles,
        "channels": _channels(base),
    }


# ───────────────────────── Public job application form ──────────────────────
# "Apply now" → a public, no-auth form that creates a Candidate + Application
# (auto-scored, source="careers") so the applicant lands directly in that job's
# pipeline in the portal. `/careers/{id}/apply` is two-segment so it never clashes
# with the single-segment `/careers/{job_id}` catch-all below.
_NOT_OPEN = ('<div class="card"><h1>Role not found</h1>'
             '<p class="muted">This role isn\'t accepting applications.</p>'
             '<a class="apply" href="/careers">View open roles</a></div>')


def _question_fields(hr: models.HiringRequest | None, v: dict) -> str:
    """Render the role's extra application questions as form fields, prefilled on re-render."""
    questions = (hr.application_questions if hr else None) or []
    if not questions:
        return ""
    parts = ['<div style="border-top:1px solid var(--line);margin:24px 0 4px;padding-top:8px"></div>']
    for q in questions:
        qid = str(q.get("id") or "")
        if not qid:
            continue
        label = _e(q.get("label"))
        req = ' <span class="req">*</span>' if q.get("required") else ""
        name = f"aq_{_e(qid)}"
        prev = _e(v.get(f"aq_{qid}"))
        if q.get("type") == "text":
            ctrl = f'<input class="inp" name="{name}" value="{prev}"{" required" if q.get("required") else ""}>'
        else:
            ctrl = f'<textarea class="inp" name="{name}" rows="4"{" required" if q.get("required") else ""}>{prev}</textarea>'
        parts.append(f'<div class="field"><label class="lbl">{label}{req}</label>{ctrl}</div>')
    return "".join(parts)


APPLICANT_SOURCES = ["direct", "referral", "internal"]


def _source_options(selected: str) -> str:
    sel = selected if selected in APPLICANT_SOURCES else "direct"
    labels = {"direct": "Direct", "referral": "Referral", "internal": "Internal"}
    return "".join(
        f'<option value="{k}"{" selected" if k == sel else ""}>{labels[k]}</option>' for k in APPLICANT_SOURCES
    )


def _apply_form(job: models.Job, *, values: dict | None = None, error: str = "", src: str = "") -> str:
    hr = job.hiring_request
    title = job.title or (hr.position if hr else "Role")
    v = values or {}
    err_html = f'<div class="err">{_e(error)}</div>' if error else ""
    norm_src = _norm_source(src)
    src_field = f'<input type="hidden" name="src" value="{_e(norm_src)}">' if norm_src != "careers" else ""
    body = (
        f'<a class="back" href="/careers/{job.id}">&larr; Back to role</a>'
        f'<div class="card"><h1>Apply: {_e(title)}</h1>'
        f'<p class="sub">{_e(settings.COMPANY_NAME)}</p>{err_html}'
        f'<form method="post" action="/careers/{job.id}/apply" enctype="multipart/form-data">{src_field}'
        f'<div class="field"><label class="lbl">Full name <span class="req">*</span></label>'
        f'<input class="inp" name="name" value="{_e(v.get("name"))}" required></div>'
        f'<div class="field"><label class="lbl">Email <span class="req">*</span></label>'
        f'<input class="inp" type="email" name="email" value="{_e(v.get("email"))}" required></div>'
        f'<div class="field"><label class="lbl">Phone</label>'
        f'<input class="inp" name="phone" value="{_e(v.get("phone"))}"></div>'
        f'<div class="field"><label class="lbl">Current Annual Total Compensation <span class="req">*</span></label>'
        f'<input class="inp" name="current_ctc" value="{_e(v.get("current_ctc"))}" placeholder="e.g. 12 LPA" required></div>'
        f'<div class="field"><label class="lbl">Expected Annual Total Compensation <span class="req">*</span></label>'
        f'<input class="inp" name="expected_ctc" value="{_e(v.get("expected_ctc"))}" placeholder="e.g. 18 LPA" required></div>'
        f'<div class="field"><label class="lbl">Notice Period (Days) <span class="req">*</span></label>'
        f'<input class="inp" type="number" min="0" name="notice_period" value="{_e(v.get("notice_period"))}" placeholder="e.g. 30" required></div>'
        f'<div class="field"><label class="lbl">Source <span class="req">*</span></label>'
        f'<select class="inp" name="source_choice">{_source_options(v.get("source_choice") or "direct")}</select></div>'
        f'<div class="field"><label class="lbl">Resume</label>'
        f'<input class="inp" type="file" name="file" accept=".pdf,.docx,.doc,.txt">'
        f'<p class="hint">PDF, DOCX or TXT — we parse it automatically to match you to the role.</p></div>'
        f'<div class="field"><label class="lbl">Or paste your resume / a short note</label>'
        f'<textarea class="inp" name="resume_text" rows="6">{_e(v.get("resume_text"))}</textarea></div>'
        f'{_question_fields(hr, v)}'
        f'<div class="field" style="flex-direction:row;align-items:flex-start;gap:8px">'
        f'<input type="checkbox" name="consent" id="consent" required style="margin-top:4px">'
        f'<label for="consent" class="hint" style="margin:0">I consent to {_e(settings.COMPANY_NAME)} storing and reviewing my application '
        f'and resume, and to my data being processed by AI tools for screening. *</label></div>'
        f'<button class="apply" type="submit">Submit application</button>'
        f'</form></div>'
    )
    return _page(f"Apply — {title} · {settings.COMPANY_NAME}", body)


@router.get("/careers/{job_id}/apply", response_class=HTMLResponse)
def apply_form(job_id: int, src: str = "", db: Session = Depends(get_db)):
    job = db.get(models.Job, job_id)
    if not job or job.status != "published":
        return HTMLResponse(_page("Not found", _NOT_OPEN), status_code=404)
    return HTMLResponse(_apply_form(job, src=src))


@router.post("/careers/{job_id}/apply", response_class=HTMLResponse)
async def submit_application(
    job_id: int,
    request: Request,
    name: str = Form(""),
    email: str = Form(""),
    phone: str = Form(""),
    resume_text: str = Form(""),
    current_ctc: str = Form(""),
    expected_ctc: str = Form(""),
    notice_period: str = Form(""),
    source_choice: str = Form("direct"),
    src: str = Form(""),
    file: UploadFile | None = File(None),
    db: Session = Depends(get_db),
):
    job = db.get(models.Job, job_id)
    if not job or job.status != "published":
        return HTMLResponse(_page("Not found", _NOT_OPEN), status_code=404)
    hr = job.hiring_request
    values = {
        "name": name, "email": email, "phone": phone, "resume_text": resume_text,
        "current_ctc": current_ctc, "expected_ctc": expected_ctc,
        "notice_period": notice_period, "source_choice": source_choice,
    }

    # Collect answers to the role's extra application questions from the multipart form.
    form = await request.form()
    answers: list[dict] = []
    missing_required = False
    for q in (hr.application_questions if hr else None) or []:
        qid = str(q.get("id") or "")
        if not qid:
            continue
        raw = form.get(f"aq_{qid}")
        ans = (raw if isinstance(raw, str) else "").strip()
        values[f"aq_{qid}"] = ans
        if q.get("required") and not ans:
            missing_required = True
        answers.append({"id": qid, "label": q.get("label") or "", "answer": ans})

    if not name.strip() or not email.strip():
        return HTMLResponse(_apply_form(job, values=values, error="Please enter your name and email.", src=src), status_code=400)
    if not current_ctc.strip() or not expected_ctc.strip() or not notice_period.strip():
        return HTMLResponse(_apply_form(job, values=values, error="Please fill current & expected compensation and notice period.", src=src), status_code=400)
    if missing_required:
        return HTMLResponse(_apply_form(job, values=values, error="Please answer all required questions.", src=src), status_code=400)

    # The applicant-declared source (direct / referral / internal); falls back to the channel tag.
    chosen_source = source_choice if source_choice in APPLICANT_SOURCES else _norm_source(src)

    file_bytes = None
    filename = mime = ""
    text = resume_text or ""
    if file is not None and file.filename:
        # Public, unauthenticated endpoint — bound the read so an oversized upload can't
        # exhaust memory. Read one byte past the cap to detect (without loading) overflow.
        file_bytes = file.file.read(_MAX_UPLOAD_BYTES + 1)
        if len(file_bytes) > _MAX_UPLOAD_BYTES:
            return HTMLResponse(
                _apply_form(job, values=values, error="Resume file is too large (max 10 MB).", src=src),
                status_code=400,
            )
        filename = file.filename
        mime = file.content_type or ""
        extracted = resume_parser.extract_text(filename, file_bytes)
        if extracted.strip():
            text = extracted

    # Public, unauthenticated endpoint — never surface a raw 500 to an applicant if parsing
    # or scoring chokes on an odd résumé; roll back and show a friendly retry instead.
    try:
        cand = recruitment.ingest_candidate(
            db, name=name.strip(), email=email.strip(), phone=phone.strip(),
            source=chosen_source, resume_text=text,
            file_bytes=file_bytes, filename=filename, mime=mime,
        )
        # Persist the applicant-entered compensation & notice into the parsed fields the talent
        # pool / pipeline read (reassign so SQLAlchemy detects the JSON change).
        cand.parsed = {
            **(cand.parsed or {}),
            "current_ctc": current_ctc.strip(),
            "salary_expectation": expected_ctc.strip(),
            "notice_period": notice_period.strip(),
        }
        app = recruitment.apply_candidate(db, cand, hr, auto_score=True)
        if answers:
            app.application_answers = answers
        db.commit()
    except Exception:
        db.rollback()
        return HTMLResponse(
            _apply_form(job, values=values, error="Something went wrong submitting your application — please try again.", src=src),
            status_code=500,
        )

    title = job.title or (hr.position if hr else "the role")
    thanks = (
        '<div class="card"><div class="success">&#10003;</div>'
        '<h1>Application received</h1>'
        f'<p class="sub">Thanks, {_e(name.strip())} — your application for <strong>{_e(title)}</strong> '
        f'at {_e(settings.COMPANY_NAME)} has been submitted.</p>'
        f'<p class="muted">Our team will review it and reach out at {_e(email.strip())}.</p>'
        '<a class="apply" href="/careers">View other open roles</a></div>'
    )
    return HTMLResponse(_page(f"Application received — {settings.COMPANY_NAME}", thanks))


# Declared LAST: this int catch-all must come after the literal /careers/* routes
# (feed.xml, rss.xml, sitemap.xml, {job_id}.json) so they aren't parsed as a job id.
@router.get("/careers/{job_id}", response_class=HTMLResponse)
def career_page(job_id: int, src: str = "", db: Session = Depends(get_db)):
    job = db.get(models.Job, job_id)
    if not job or job.status != "published":
        return HTMLResponse(_page("Not found", '<div class="card"><h1>Role not found</h1>'
                                   '<p class="muted">This role isn\'t published.</p>'
                                   '<a class="apply" href="/careers">View open roles</a></div>'), status_code=404)
    hr = job.hiring_request
    # Prefer the LIVE requisition facts (what "Edit job" controls) so edits reflect here
    # immediately; fall back to the generated JD title.
    title = (hr.position if hr and hr.position else job.title) or "Role"
    # Carry a referral tag (e.g. ?src=linkedin from a shared post) onto the Apply link
    # so the applicant is attributed to that channel when they submit.
    apply_href = f"/careers/{job.id}/apply"
    norm_src = _norm_source(src)
    if src and norm_src != "careers":
        apply_href += f"?src={norm_src}"
    ld = _job_posting_ld(job)
    chips = []
    if hr:
        if hr.location:
            chips.append(f'<span class="chip">{_e(hr.location)}</span>')
        if hr.work_mode:
            chips.append(f'<span class="chip alt">{_e(hr.work_mode)}</span>')
        if hr.department:
            chips.append(f'<span class="chip alt">{_e(hr.department)}</span>')
        # Salary chip = ONLY the recruiter's stated Budget/CTC (the live, editable value).
        # No AI-suggested fallback — that was a static estimate that didn't track edits.
        if (hr.budget_ctc or "").strip():
            chips.append(f'<span class="chip alt">{_e(hr.budget_ctc.strip())}</span>')
    body = (
        f'<div class="card"><h1>{_e(title)}</h1>'
        f'<p class="sub">{_e(settings.COMPANY_NAME)}</p>'
        f'<div class="chips">{"".join(chips)}</div>'
        f'<div>{_description_html(job)}</div>'
        f'<a class="apply" href="{_e(apply_href)}">Apply now</a>'
        f'</div>'
    )
    head = f'<script type="application/ld+json">{_ld_script(ld)}</script>'
    return HTMLResponse(_page(f"{title} — {settings.COMPANY_NAME}", body, head_extra=head))
