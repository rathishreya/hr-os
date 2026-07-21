"""Async one-way video interview with PRE-DEFINED questions (not AI-generated).

Flow: candidate opens a link → records a video answer per question → the browser
transcribes on-device (open-source Whisper) and uploads {video, transcript}. Recruiters
review the video + transcript. No paid services; questions are set per role.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Response, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..config import settings
from ..database import SessionLocal, get_db
from ..services import security
from ..services.ai import ai
from ..services.recruitment import hr_to_dict, log, str_list, to_rating

router = APIRouter(prefix="/api/video-interview", tags=["video-interview"])

_MAX_VIDEO_BYTES = 200 * 1024 * 1024  # 200 MB per upload — guard the free-tier instance


def _read_capped(file: UploadFile) -> bytes:
    data = file.file.read(_MAX_VIDEO_BYTES + 1)
    if len(data) > _MAX_VIDEO_BYTES:
        raise HTTPException(413, "Recording is too large (max 200 MB). Try a shorter answer.")
    return data


def _finalize_recording(interview_id: int) -> None:
    """Background job: transcribe (if the browser didn't) + run AI evaluation, then mark
    completed. Runs after the response is sent so the candidate's upload returns instantly."""
    with SessionLocal() as db:
        vi = db.get(models.VideoInterview, interview_id)
        if not vi:
            return
        if not (vi.transcript or "").strip() and vi.recording:
            text, _ = _transcribe_gemini(vi.recording, vi.recording_mime)
            vi.transcript = text or ""
        _run_evaluation(db, vi)
        vi.status = "completed"
        vi.completed_at = datetime.now(timezone.utc)
        db.commit()

DEFAULT_QUESTIONS = [
    "Tell us about yourself and why this role interests you.",
    "Walk us through a project or accomplishment you're proud of.",
    "Describe a challenge you faced and how you worked through it.",
    "What are you looking for in your next role, and where do you want to grow?",
]

def _transcribe_gemini(data: bytes, mime: str) -> tuple[str, str]:
    """Server-side transcription via Gemini (uses the configured key). Returns
    (transcript, error_message). Never raises."""
    from ..config import settings

    base = settings.OPENAI_BASE_URL or ""
    key = settings.OPENAI_API_KEY
    if not data:
        return "", "No recording to transcribe."
    if not key or "generativelanguage" not in base:
        return "", "Server transcription needs a Gemini key — or rely on the candidate's on-device transcription."
    if len(data) > 18_000_000:   # inline-data guard (~18MB); larger needs the File API
        return "", "Recording is too large for server-side transcription (over ~18MB)."
    import base64
    import httpx

    model = settings.OPENAI_MODEL or "gemini-2.5-flash"
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"
    payload = {"contents": [{"parts": [
        {"text": "Transcribe the spoken words in this interview recording verbatim. "
                 "Output ONLY the transcript text — no labels, timestamps or commentary."},
        {"inline_data": {"mime_type": mime or "video/webm", "data": base64.b64encode(data).decode()}},
    ]}]}
    try:
        r = httpx.post(url, json=payload, timeout=180)
        if r.status_code == 429:
            return "", "AI quota exceeded (Gemini free tier). Wait a minute and try again."
        r.raise_for_status()
        cands = r.json().get("candidates", [])
        if not cands:
            return "", "No transcript returned by the model."
        parts = cands[0].get("content", {}).get("parts", [])
        txt = " ".join(p.get("text", "") for p in parts).strip()
        return (txt, "") if txt else ("", "No speech detected in the recording.")
    except Exception as e:
        return "", f"Transcription failed: {e}"
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    

def _role_context(db: Session, vi: models.VideoInterview) -> dict:
    """Role/JD context so the AI can judge technical depth and fit, not just communication."""
    app = db.get(models.Application, vi.application_id)
    hr = app.hiring_request if app else None
    if not hr:
        return {"position": vi.role_position}
    role = hr_to_dict(hr)
    job = hr.job
    if job:
        role["jd"] = {
            "title": job.title,
            "description": job.description,
            "responsibilities": list(job.responsibilities or []),
            "requirements": list(job.requirements or []),
        }
    return role

def _normalize_evaluation(result: dict, questions: list[str]) -> dict:
    """Coerce the model's evaluation into a stable shape: exactly one per-question entry per
    question (aligned by q_index, else positionally), a clamped verdict, and clean lists.
    Crash-proof so a malformed model response can never strand a completed interview."""
    n = len(questions)
    raw_pq = result.get("per_question")
    raw_pq = raw_pq if isinstance(raw_pq, list) else []
    by_index: dict[int, dict] = {}
    for pq in raw_pq:
        if isinstance(pq, dict):
            qi = pq.get("q_index")
            # bool is an int subclass — exclude it so a stray true/false can't claim slot 0/1.
            if isinstance(qi, int) and not isinstance(qi, bool) and 0 <= qi < n and qi not in by_index:
                by_index[qi] = pq
    # Trust q_index only when EVERY entry carried a clean, unique, in-range one. If the model
    # tagged only some entries (a common partial-compliance failure), aligning by position keeps
    # the un-tagged answers instead of dropping them into empty "No answer" slots.
    use_positional = len(by_index) < len(raw_pq)
    per_question = []
    for i in range(n):
        pq = (raw_pq[i] if i < len(raw_pq) else {}) if use_positional else by_index.get(i, {})
        pq = pq if isinstance(pq, dict) else {}
        per_question.append({
            "q_index": i,
            "question": questions[i],
            "answer": str(pq.get("answer") or ""),
            "rating": to_rating(pq.get("rating")),
            "comment": str(pq.get("comment") or ""),
        })
    verdict = result.get("verdict")
    raw_scores = result.get("scores")
    raw_scores = raw_scores if isinstance(raw_scores, dict) else {}
    # Coerce/clamp present score keys to 0-100 (like ratings); leave a genuinely-missing key out
    # so the UI hides the badge rather than showing a fabricated 0.
    scores = {k: to_rating(raw_scores[k]) for k in ("communication", "technical_depth", "confidence", "overall") if k in raw_scores}
    return {
        "verdict": verdict if verdict in ("fit", "maybe", "unfit") else "",
        "reasoning": str(result.get("reasoning") or ""),
        "strengths": str_list(result.get("strengths")),
        "gaps": str_list(result.get("gaps")),
        "summary": str(result.get("summary") or ""),
        "scores": scores,
        "per_question": per_question,
    }


def _run_evaluation(db: Session, vi: models.VideoInterview) -> None:
    """Generate the structured AI evaluation (per-question Q/A/rating + overall fit verdict,
    reasoning, strengths, gaps) from the transcript. Falls back to a heuristic via the AI layer
    when no model is configured. Never raises; clears the evaluation when there's nothing to judge."""
    transcript = (vi.transcript or "").strip()
    questions = [str(q) for q in (vi.questions or [])]
    if not transcript or not questions:
        vi.evaluation = {}
        return
    role = _role_context(db, vi)
    result, provider = ai.evaluate_video_interview(role, questions, transcript, vi.timeline or [])
    ev = _normalize_evaluation(result if isinstance(result, dict) else {}, questions)
    vi.evaluation = ev
    vi.scores = ev["scores"]
    vi.summary = ev["summary"] or ev["reasoning"]
    vi.ai_provider = provider


def _answer_out(a: models.VideoAnswer) -> dict:
    return {
        "id": a.id, "q_index": a.q_index, "question": a.question, "transcript": a.transcript,
        "mime": a.mime, "duration": a.duration, "has_video": a.video is not None, "created_at": a.created_at,
    }


def _out(vi: models.VideoInterview) -> dict:
    answers = sorted(vi.answers, key=lambda a: a.q_index)
    return {
        "id": vi.id, "application_id": vi.application_id, "candidate_id": vi.candidate_id,
        "role_position": vi.role_position, "questions": vi.questions or [], "status": vi.status,
        "summary": vi.summary or "", "scores": vi.scores or {}, "evaluation": vi.evaluation or {},
        "transcript": vi.transcript or "", "timeline": vi.timeline or [], "proctoring": vi.proctoring or {},
        "duration": vi.duration or 0, "has_recording": vi.recording is not None,
        "created_at": vi.created_at, "completed_at": vi.completed_at,
        "answers": [_answer_out(a) for a in answers],
    }


def _role_questions(db: Session, app: models.Application):
    hr = db.get(models.HiringRequest, app.hiring_request_id)
    job = hr.job if hr else None
    qs = job.video_questions if (job and job.video_questions) else DEFAULT_QUESTIONS
    title = (job.title if job else (hr.position if hr else ""))
    return list(qs), title


@router.post("/generate-questions")
def generate_questions(application_id: int, db: Session = Depends(get_db)):
    """AI-generate video interview questions tailored to the role/JD. Stateless — returns the
    questions for the recruiter to review/edit and save; does not persist on its own."""
    app = db.get(models.Application, application_id)
    if not app:
        raise HTTPException(404, "Application not found")
    hr = app.hiring_request
    role = hr_to_dict(hr) if hr else {"position": app.candidate.name if app.candidate else ""}
    job = hr.job if hr else None
    if job:
        role["jd"] = {
            "title": job.title,
            "description": job.description,
            "responsibilities": list(job.responsibilities or []),
            "requirements": list(job.requirements or []),
        }
    result, provider = ai.generate_video_questions(role)
    questions = [str(q).strip() for q in (result.get("questions") or []) if str(q).strip()][:8]
    if not questions:
        questions = list(DEFAULT_QUESTIONS)
    return {"questions": questions, "provider": provider}


@router.get("")
def get_or_create(application_id: int, db: Session = Depends(get_db)):
    app = db.get(models.Application, application_id)
    if not app:
        raise HTTPException(404, "Application not found")
    vi = db.scalar(select(models.VideoInterview).where(models.VideoInterview.application_id == application_id))
    questions, title = _role_questions(db, app)
    if not vi:
        vi = models.VideoInterview(application_id=application_id, candidate_id=app.candidate_id,
                                   role_position=title, questions=questions)
        db.add(vi)
        db.commit()
        db.refresh(vi)
    elif vi.status != "completed" and (vi.questions or []) != questions:
        # keep a not-yet-taken interview in sync with the role's current questions
        vi.questions = questions
        db.commit()
        db.refresh(vi)
    out = _out(vi)
    cand = db.get(models.Candidate, vi.candidate_id)
    out["candidate_name"] = cand.name if cand else ""
    return out


@router.post("/verify")
def verify_access(application_id: int, code: str, db: Session = Depends(get_db)):
    """Check the access code the candidate received in their invite email. The interview link is
    enumerable (/interview/{id}), so this confirms the RIGHT person is taking it. Public (the
    candidate isn't logged in), but the code is unguessable without the server secret."""
    app = db.get(models.Application, application_id)
    if not app:
        raise HTTPException(404, "Application not found")
    if not security.verify_interview_code(application_id, code, settings.SECRET_KEY):
        raise HTTPException(403, "That access code doesn't match. Please copy it exactly from your invite email.")
    return {"ok": True, "candidate_name": app.candidate.name if app.candidate else ""}


@router.post("/{interview_id}/answer")
def submit_answer(
    interview_id: int,
    q_index: int = Form(...),
    question: str = Form(""),
    transcript: str = Form(""),
    duration: float = Form(0),
    file: UploadFile | None = File(None),
    db: Session = Depends(get_db),
):
    vi = db.get(models.VideoInterview, interview_id)
    if not vi:
        raise HTTPException(404, "Interview not found")
    ans = db.scalar(
        select(models.VideoAnswer).where(
            models.VideoAnswer.interview_id == interview_id,
            models.VideoAnswer.q_index == q_index,
        )
    )
    if not ans:
        ans = models.VideoAnswer(interview_id=interview_id, q_index=q_index)
        db.add(ans)
    ans.question = question
    ans.transcript = transcript
    ans.duration = duration
    if file is not None and file.filename:
        ans.video = _read_capped(file)
        ans.mime = file.content_type or "video/webm"
    db.commit()
    db.refresh(ans)
    log(db, "video_interview.answer", "video_interview", interview_id, {"q_index": q_index, "has_video": ans.video is not None})
    db.commit()
    return _answer_out(ans)


@router.get("/answers/{answer_id}/video")
def serve_answer_video(answer_id: int, db: Session = Depends(get_db)):
    ans = db.get(models.VideoAnswer, answer_id)
    if not ans or not ans.video:
        raise HTTPException(404, "No video on record")
    return Response(content=ans.video, media_type=ans.mime or "video/webm",
                    headers={"Content-Disposition": f'inline; filename="answer-{answer_id}.webm"'})


@router.post("/{interview_id}/recording")
def submit_recording(
    interview_id: int,
    background: BackgroundTasks,
    transcript: str = Form(""),
    timeline: str = Form("[]"),
    proctoring: str = Form("{}"),
    duration: float = Form(0),
    code: str = Form(""),
    file: UploadFile | None = File(None),
    db: Session = Depends(get_db),
):
    """Store the single continuous (proctored) recording + transcript, timeline and proctoring
    events, then transcribe/evaluate in the BACKGROUND so the candidate's upload returns fast
    (server transcription/AI can take 10–60s and would otherwise hang the browser / time out)."""
    vi = db.get(models.VideoInterview, interview_id)
    if not vi:
        raise HTTPException(404, "Interview not found")
    # Enforce the emailed access code server-side, so a client-side bypass can't submit an
    # interview for someone else's (enumerable) link.
    if not security.verify_interview_code(vi.application_id, code, settings.SECRET_KEY):
        raise HTTPException(403, "Invalid or missing access code — re-open your invite link and enter the code from your email.")
    # One-time link: once an interview has been submitted (uploading/evaluating or finished),
    # reject any further submission so the same URL can't be used to record again. A recruiter
    # can DELETE the interview to deliberately allow a re-take.
    if vi.status in ("processing", "completed"):
        raise HTTPException(409, "This interview has already been submitted.")
    try:
        vi.timeline = json.loads(timeline) if timeline else []
    except (ValueError, TypeError):
        vi.timeline = []
    try:
        vi.proctoring = json.loads(proctoring) if proctoring else {}
    except (ValueError, TypeError):
        vi.proctoring = {}
    vi.duration = duration or 0
    if file is not None and file.filename:
        vi.recording = _read_capped(file)
        vi.recording_mime = file.content_type or "video/webm"

    # Keep the on-device (browser) transcript; transcription fallback + AI evaluation run
    # in the background. Mark "processing" until that finishes.
    vi.transcript = (transcript or "").strip()
    vi.status = "processing"
    log(db, "video_interview.recording", "video_interview", vi.id,
        {"duration": vi.duration, "focus_lost": (vi.proctoring or {}).get("focus_lost", 0), "has_recording": vi.recording is not None})
    db.commit()
    db.refresh(vi)
    background.add_task(_finalize_recording, vi.id)
    return _out(vi)


@router.get("/{interview_id}/recording")
def serve_recording(interview_id: int, db: Session = Depends(get_db)):
    vi = db.get(models.VideoInterview, interview_id)
    if not vi or not vi.recording:
        raise HTTPException(404, "No recording on record")
    return Response(content=vi.recording, media_type=vi.recording_mime or "video/webm",
                    headers={"Content-Disposition": f'inline; filename="interview-{interview_id}.webm"'})


@router.post("/{interview_id}/transcribe")
def retranscribe(interview_id: int, db: Session = Depends(get_db)):
    """(Re)transcribe the stored recording server-side + regenerate the summary — useful to
    retry after an AI quota hit, without re-recording. Surfaces the reason on failure."""
    vi = db.get(models.VideoInterview, interview_id)
    if not vi:
        raise HTTPException(404, "Interview not found")
    if not vi.recording:
        raise HTTPException(400, "No recording to transcribe.")
    text, error = _transcribe_gemini(vi.recording, vi.recording_mime)
    if not text:
        raise HTTPException(503, error or "Transcription failed — try again shortly.")
    vi.transcript = text
    _run_evaluation(db, vi)
    log(db, "video_interview.retranscribed", "video_interview", vi.id, {"chars": len(text)})
    db.commit()
    db.refresh(vi)
    return _out(vi)


@router.post("/{interview_id}/evaluate")
def evaluate(interview_id: int, db: Session = Depends(get_db)):
    """(Re)generate the structured AI evaluation (per-question Q/A/rating + overall fit verdict,
    reasoning, strengths, gaps) from the stored transcript — without re-transcribing."""
    vi = db.get(models.VideoInterview, interview_id)
    if not vi:
        raise HTTPException(404, "Interview not found")
    if not (vi.transcript or "").strip():
        raise HTTPException(400, "No transcript to evaluate — generate the transcript first.")
    _run_evaluation(db, vi)
    log(db, "video_interview.evaluated", "video_interview", vi.id,
        {"verdict": (vi.evaluation or {}).get("verdict"), "provider": vi.ai_provider})
    db.commit()
    db.refresh(vi)
    return _out(vi)


@router.delete("/{interview_id}", status_code=204)
def delete_interview(interview_id: int, db: Session = Depends(get_db)):
    """Delete the interview recording + transcript/summary (cascades answers). The next
    time the candidate opens the link a fresh interview is created, so they can re-record."""
    vi = db.get(models.VideoInterview, interview_id)
    if not vi:
        raise HTTPException(404, "Interview not found")
    db.delete(vi)
    log(db, "video_interview.deleted", "video_interview", interview_id, {})
    db.commit()


@router.post("/{interview_id}/complete")
def complete(interview_id: int, db: Session = Depends(get_db)):
    vi = db.get(models.VideoInterview, interview_id)
    if not vi:
        raise HTTPException(404, "Interview not found")
    vi.status = "completed"
    vi.completed_at = datetime.now(timezone.utc)
    log(db, "video_interview.completed", "video_interview", vi.id, {"answers": len(vi.answers)})
    db.commit()
    db.refresh(vi)
    return _out(vi)
