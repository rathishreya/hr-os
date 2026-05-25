"""Async one-way video interview with PRE-DEFINED questions (not AI-generated).

Flow: candidate opens a link → records a video answer per question → the browser
transcribes on-device (open-source Whisper) and uploads {video, transcript}. Recruiters
review the video + transcript. No paid services; questions are set per role.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..services.recruitment import log

router = APIRouter(prefix="/api/video-interview", tags=["video-interview"])

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


def _summarize(role: str, questions: list, transcript: str, proctoring: dict) -> str:
    """AI summary of the interview transcript (Gemini etc. when configured), else a
    factual heuristic summary. Never raises."""
    transcript = (transcript or "").strip()
    if not transcript:
        return ""
    from ..services.ai import ai
    from ..services.ai.provider import MockProvider

    prov = ai.provider
    if not isinstance(prov, MockProvider):
        try:
            system = ("You are an expert recruiter. Summarize a candidate's recorded video interview "
                      "for the hiring team in 4-6 sentences: communication style, the key points they made, "
                      "clear strengths, and any gaps or concerns. Be concise and factual — do not invent details.")
            qs = "\n".join(f"- {q}" for q in (questions or []))
            user = f"Role: {role}\n\nQuestions asked:\n{qs}\n\nContinuous interview transcript:\n{transcript[:6000]}"
            txt = prov.generate(system, user, want_json=False)
            if txt and txt.strip():
                return txt.strip()
        except Exception:
            pass
    words = len(transcript.split())
    flags = (proctoring or {}).get("focus_lost", 0)
    note = f" {flags} tab switch(es) were logged." if flags else ""
    return (f"Candidate completed the video interview — {words} words across {len(questions or [])} questions.{note} "
            "AI summary couldn't be generated right now (model busy or rate-limited) — review the recording and "
            "transcript below, or click Generate again shortly for the AI write-up.")


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
        "summary": vi.summary or "", "scores": vi.scores or {},
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
    return _out(vi)


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
        ans.video = file.file.read()
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
    transcript: str = Form(""),
    timeline: str = Form("[]"),
    proctoring: str = Form("{}"),
    duration: float = Form(0),
    file: UploadFile | None = File(None),
    db: Session = Depends(get_db),
):
    """Store the single continuous (proctored) recording for the whole session + transcript,
    question timeline, and proctoring events; mark the interview completed."""
    vi = db.get(models.VideoInterview, interview_id)
    if not vi:
        raise HTTPException(404, "Interview not found")
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
        vi.recording = file.file.read()
        vi.recording_mime = file.content_type or "video/webm"

    # Transcript: prefer the on-device (browser) transcript; fall back to server-side Gemini.
    final_transcript = (transcript or "").strip()
    if not final_transcript and vi.recording:
        final_transcript, _ = _transcribe_gemini(vi.recording, vi.recording_mime)
    vi.transcript = final_transcript
    vi.summary = _summarize(vi.role_position, vi.questions or [], vi.transcript, vi.proctoring)
    vi.status = "completed"
    vi.completed_at = datetime.now(timezone.utc)
    log(db, "video_interview.recording", "video_interview", vi.id,
        {"duration": vi.duration, "focus_lost": (vi.proctoring or {}).get("focus_lost", 0), "has_recording": vi.recording is not None})
    db.commit()
    db.refresh(vi)
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
    vi.summary = _summarize(vi.role_position, vi.questions or [], text, vi.proctoring)
    log(db, "video_interview.retranscribed", "video_interview", vi.id, {"chars": len(text)})
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
