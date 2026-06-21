import os
import uuid
from datetime import datetime, timezone

import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from database import reports_collection

load_dotenv()

router = APIRouter(prefix="/realtime", tags=["Realtime Interview"])

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_REALTIME_MODEL = os.getenv("OPENAI_REALTIME_MODEL", "gpt-realtime")
OPENAI_REALTIME_VOICE = os.getenv("OPENAI_REALTIME_VOICE", "alloy")


class RealtimeSessionRequest(BaseModel):
    interview_id: str | None = None
    user_email: str
    title: str = "Realtime Interview"
    interview_type: str = "custom"
    role: str = "Candidate"
    company: str = ""
    duration: int = 15
    resume_context: str = ""
    topics: str = ""
    difficulty: str = "medium"


def utc_now():
    return datetime.now(timezone.utc)


def build_realtime_instructions(req: RealtimeSessionRequest) -> str:
    company = req.company or "the target organization"
    interview_type = req.interview_type or "custom interview"
    role = req.role or "Candidate"
    topics = (
        req.topics
        or "candidate background, role fit, communication, projects, and practical reasoning"
    )

    return f"""
You are Jarvis, a realistic human interviewer.

Interview type: {interview_type}
Role: {role}
Company/context: {company}
Difficulty: {req.difficulty}
Focus topics: {topics}

Candidate resume/context:
{req.resume_context[:2500] if req.resume_context else "No resume context provided."}

Your behavior:
- Speak naturally like a real interviewer, not like a chatbot.
- Ask one question at a time.
- Listen to the candidate's answer and ask specific follow-ups.
- Do not randomly jump topics.
- Do not repeat questions.
- If the candidate pauses, treat it as their answer ending and continue.
- If the answer is vague, ask for a concrete example.
- If the answer is strong, go deeper with a sharper follow-up.
- Keep questions short and conversational.
- Do not lecture during the interview.
- Never say "as an AI".
- Support any interview type: technical, HR, behavioral, civil engineering, government, MBA, viva, custom.
- End naturally only if the candidate asks to end or the session is over.

Opening behavior:
Start by greeting the candidate and asking them to introduce themselves briefly.
""".strip()


@router.post("/session")
async def create_realtime_session(req: RealtimeSessionRequest):
    """
    Creates an ephemeral OpenAI Realtime client secret for browser WebRTC.
    Backend calls OpenAI /v1/realtime/client_secrets.
    Frontend uses returned ephemeral secret for WebRTC SDP exchange.
    """

    if not OPENAI_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="OPENAI_API_KEY missing in backend .env",
        )

    if not req.user_email:
        raise HTTPException(status_code=400, detail="user_email is required")

    interview_id = req.interview_id or f"realtime_{uuid.uuid4().hex}"
    instructions = build_realtime_instructions(req)

    payload = {
        "session": {
            "type": "realtime",
            "model": OPENAI_REALTIME_MODEL,
            "instructions": instructions,
            "audio": {
                "input": {
                    "transcription": {
                        "model": "whisper-1"
                    },
                    "turn_detection": {
                        "type": "server_vad",
                        "threshold": 0.5,
                        "prefix_padding_ms": 300,
                        "silence_duration_ms": 900,
                        "create_response": True,
                        "interrupt_response": True,
                    },
                },
                "output": {
                    "voice": OPENAI_REALTIME_VOICE
                },
            },
        }
    }

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(
                "https://api.openai.com/v1/realtime/client_secrets",
                headers={
                    "Authorization": f"Bearer {OPENAI_API_KEY}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )

        if response.status_code >= 400:
            print("❌ OpenAI realtime client_secrets failed")
            print("Status:", response.status_code)
            print("Response:", response.text)

            raise HTTPException(
                status_code=response.status_code,
                detail=f"OpenAI realtime client secret failed: {response.text}",
            )

        session_data = response.json()

        reports_collection.update_one(
            {"interview_id": interview_id},
            {
                "$set": {
                    "interview_id": interview_id,
                    "user_email": req.user_email,
                    "title": req.title,
                    "interview_type": req.interview_type,
                    "resume_context": req.resume_context,
                    "status": "Realtime Interview In Progress",
                    "session_type": "realtime",
                    "duration": f"{req.duration}:00",
                    "realtime_model": OPENAI_REALTIME_MODEL,
                    "realtime_voice": OPENAI_REALTIME_VOICE,
                    "updated_at": utc_now(),
                },
                "$setOnInsert": {
                    "created_at": utc_now(),
                    "transcript": [],
                    "ai_questions": [],
                    "user_answers": [],
                    "structured_turns": [],
                    "mentor_chat_history": [],
                    "is_pinned": False,
                    "video_path": "",
                    "analysis": [],
                    "emotions": {},
                    "code_snapshot": "",
                    "code_analysis": "",
                    "realtime_events": [],
                },
            },
            upsert=True,
        )

        return {
            "status": "success",
            "interview_id": interview_id,
            "session": session_data,
            "model": OPENAI_REALTIME_MODEL,
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Realtime session error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class RealtimeEventRequest(BaseModel):
    interview_id: str
    user_email: str | None = None
    event_type: str
    role: str = ""
    text: str = ""
    raw_event: dict | None = None


@router.post("/event")
async def save_realtime_event(req: RealtimeEventRequest):
    if not req.interview_id:
        raise HTTPException(status_code=400, detail="interview_id is required")

    event_doc = {
        "event_type": req.event_type,
        "role": req.role,
        "text": req.text,
        "raw_event": req.raw_event or {},
        "created_at": utc_now(),
    }

    update = {
        "$push": {
            "realtime_events": event_doc,
        },
        "$set": {
            "updated_at": utc_now(),
        },
    }

    if req.text:
        update["$push"]["transcript"] = {
            "role": req.role or "unknown",
            "text": req.text,
            "event_type": req.event_type,
            "created_at": utc_now(),
        }

        if req.role == "user":
            update["$push"]["user_answers"] = {
                "text": req.text,
                "created_at": utc_now(),
            }

        if req.role in ["assistant", "bot", "ai"]:
            update["$push"]["ai_questions"] = {
                "text": req.text,
                "type": "realtime_voice",
                "created_at": utc_now(),
            }

    reports_collection.update_one(
        {"interview_id": req.interview_id},
        update,
        upsert=True,
    )

    return {"status": "saved"}


class RealtimeEndRequest(BaseModel):
    interview_id: str
    user_email: str | None = None
    code_snapshot: str = ""
    duration_minutes: str = "15"


@router.post("/end")
async def end_realtime_session(req: RealtimeEndRequest):
    if not req.interview_id:
        raise HTTPException(status_code=400, detail="interview_id is required")

    reports_collection.update_one(
        {"interview_id": req.interview_id},
        {
            "$set": {
                "status": "Completed",
                "code_snapshot": req.code_snapshot or "",
                "duration": f"{req.duration_minutes}:00",
                "updated_at": utc_now(),
            }
        },
        upsert=True,
    )

    return {
        "status": "success",
        "message": "Realtime interview ended",
        "interview_id": req.interview_id,
    }