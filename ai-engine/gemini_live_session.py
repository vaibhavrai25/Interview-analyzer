import os
import re
import json
import uuid
import asyncio
import urllib.parse
from datetime import datetime, timezone

import websockets
from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from database import reports_collection

load_dotenv()

router = APIRouter(prefix="/gemini", tags=["Gemini Live Interview"])

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_LIVE_MODEL = os.getenv("GEMINI_LIVE_MODEL", "gemini-2.0-flash-exp")

# Force single line string to prevent parsing errors
GEMINI_WS_URL = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent"

VOICE_BY_INTERVIEWER = {
    "male_balanced": "Puck",
    "male_strict": "Charon",
    "female_warm": "Kore",
    "female_professional": "Aoede",
    "male_deep": "Fenrir",
}

STYLE_BY_INTERVIEWER = {
    "male_balanced": (
        "balanced male interviewer: calm, precise, professional, encouraging but not casual"
    ),
    "male_strict": (
        "strict senior male interviewer: concise, challenging, asks about trade-offs, bugs, ownership, and edge cases"
    ),
    "female_warm": (
        "warm female interviewer: supportive, conversational, clear, asks thoughtful follow-ups"
    ),
    "female_professional": (
        "professional female interviewer: structured, polished, formal, evaluates clarity and role-fit"
    ),
    "male_deep": (
        "deep-voiced senior interviewer: composed, analytical, slightly tough, production-focused"
    ),
}

class GeminiLiveSessionRequest(BaseModel):
    interview_id: str | None = None
    user_email: str
    title: str = "Gemini Live Interview"
    interview_type: str = "custom"
    role: str = "Candidate"
    company: str = ""
    duration: int = 15
    resume_context: str = ""
    topics: str = ""
    difficulty: str = "medium"
    interviewer_voice: str = "male_balanced"

class GeminiLiveEventRequest(BaseModel):
    interview_id: str
    user_email: str | None = None
    event_type: str
    role: str = ""
    text: str = ""
    raw_event: dict | None = None

class GeminiLiveEndRequest(BaseModel):
    interview_id: str
    user_email: str | None = None
    code_snapshot: str = ""
    duration_minutes: str = "15"

def utc_now():
    return datetime.now(timezone.utc)

def compact_text(value: str, limit: int = 1200) -> str:
    safe = re.sub(r"\s+", " ", value or "").strip()
    return safe[:limit]

def extract_resume_highlights(resume_context: str) -> str:
    text = resume_context or ""
    if not text.strip():
        return "No resume details were provided."

    highlights = []
    project_keywords = [
        "jarvis", "interview", "career guru", "holoboard", "mern",
        "fastapi", "react", "mongodb", "python", "whisper", "socket",
        "cloudinary", "leetcode", "codeforces", "codechef",
    ]

    sentences = re.split(r"[\n\r.]+", text)
    for sentence in sentences:
        s = sentence.strip()
        if not s:
            continue
        ls = s.lower()
        if any(k in ls for k in project_keywords):
            highlights.append(compact_text(s, 220))
        if len(highlights) >= 4:
            break

    if not highlights:
        for sentence in sentences:
            s = sentence.strip()
            if len(s) > 40:
                highlights.append(compact_text(s, 220))
            if len(highlights) >= 3:
                break

    if not highlights:
        return compact_text(text, 700)
    return " | ".join(highlights)

def infer_role_profile(role: str, interview_type: str = "", topics: str = ""):
    raw = f"{role or ''} {interview_type or ''} {topics or ''}".lower()

    if any(x in raw for x in ["sde", "software", "developer", "frontend", "backend", "full stack", "mern", "java", "python", "react", "node", "fastapi", "web", "app"]):
        return {
            "type": "Software Engineering Interview",
            "focus": "projects, DSA, code quality, debugging, APIs, databases, system design basics, scalability, ownership",
            "style": "Ask technical follow-ups about implementation, complexity, edge cases, production issues, debugging, and candidate ownership."
        }

    if any(x in raw for x in ["data", "ml", "ai", "machine learning", "analytics"]):
        return {
            "type": "AI/Data Interview",
            "focus": "projects, modeling choices, data quality, evaluation metrics, deployment, failure cases, practical reasoning",
            "style": "Ask about assumptions, model trade-offs, metrics, deployment, reliability, and limitations."
        }

    if any(x in raw for x in ["civil", "site", "structural", "construction", "geotechnical", "transportation"]):
        return {
            "type": "Civil Engineering Interview",
            "focus": "core civil concepts, site judgment, safety, materials, project execution, ethics",
            "style": "Ask practical engineering questions connected to site execution, safety, and conceptual clarity."
        }

    if any(x in raw for x in ["hr", "human resources", "behavioral", "behavioural"]):
        return {
            "type": "HR / Behavioral Interview",
            "focus": "motivation, strengths, weaknesses, teamwork, conflict, leadership, communication",
            "style": "Ask warm but observant behavioral questions and request real examples."
        }

    if any(x in raw for x in ["government", "ssc", "upsc", "public", "bank"]):
        return {
            "type": "Government / Public Service Interview",
            "focus": "ethics, decision making, awareness, public service motivation, communication",
            "style": "Ask formal situational and ethical questions with balanced follow-ups."
        }

    return {
        "type": "Custom Role Interview",
        "focus": "resume claims, role-fit, projects, communication, problem-solving, practical decision making",
        "style": "Adapt questions to the candidate resume and role, with one specific follow-up at a time."
    }

def sanitize_resume_context(raw_text: str, max_chars: int = 2000) -> str:
    """
    Surgically cleans the resume text to prevent WebSocket context overload.
    Strips weird unicode, massive line breaks, and limits the token footprint.
    """
    if not raw_text:
        return "No resume context provided."
    
    # Remove massive whitespaces, tabs, and newlines
    sanitized = re.sub(r'\s+', ' ', raw_text)
    
    # Remove non-ascii characters that sometimes break strict JSON parsers over WS
    sanitized = sanitized.encode('ascii', 'ignore').decode('ascii')
    
    return sanitized.strip()[:max_chars]

def build_gemini_instructions(req: GeminiLiveSessionRequest) -> str:
    company = req.company or "the target organization"
    role = req.role or "Candidate"
    role_profile = infer_role_profile(role, req.interview_type, req.topics)

    interviewer_key = req.interviewer_voice or "male_balanced"
    interviewer_style = STYLE_BY_INTERVIEWER.get(
        interviewer_key,
        STYLE_BY_INTERVIEWER["male_balanced"],
    )

    resume_highlights = extract_resume_highlights(req.resume_context)
    safe_full_resume = sanitize_resume_context(req.resume_context)

    return f"""
You are Jarvis, a realistic human interviewer.

Role entered by candidate: {role}
Auto-detected interview type: {role_profile["type"]}
Company/context: {company}
Difficulty: {req.difficulty}
Interviewer style/personality: {interviewer_style}

Resume highlights to acknowledge naturally:
{resume_highlights}

Main interview focus:
{role_profile["focus"]}

Role-specific interview strategy:
{role_profile["style"]}

Full candidate resume/context:
{safe_full_resume}

Critical conversation rules:
- Be fast and concise.
- Ask exactly ONE question at a time.
- Most responses must be under 18 words.
- Do not monologue.
- Do not give long feedback after every answer.
- Acknowledge one or two concrete resume details in the opening.
- Use the resume/context to structure the interview.
- Start with background and one relevant project.
- Then move into role-specific technical/practical depth.
- Ask specific follow-ups based on what the candidate actually said.
- If code snapshot is provided, silently audit logic, edge cases, complexity, and code quality.
- Only ask about code if there is a meaningful bug, edge case, complexity issue, incomplete logic, or production concern.
- If the code is incomplete but not yet relevant, stay silent on code.
- If the candidate pauses, treat it as answer completion.
- Never say "as an AI".
- Never ask multiple questions in one response.

Opening instruction:
Start with one short personalized sentence using resume details, then ask the candidate to introduce themselves and one relevant project.
""".strip()

def build_gemini_setup_message(req: GeminiLiveSessionRequest):
    instructions = build_gemini_instructions(req)
    voice_name = VOICE_BY_INTERVIEWER.get(
        req.interviewer_voice or "male_balanced",
        "Puck",
    )

    return {
        "setup": {
            "model": f"models/{GEMINI_LIVE_MODEL}",
            "generationConfig": {
                "responseModalities": ["AUDIO"],
                "temperature": 0.45,
                "speechConfig": {
                    "voiceConfig": {
                        "prebuiltVoiceConfig": {
                            "voiceName": voice_name
                        }
                    }
                },
            },
            "systemInstruction": {
                "parts": [{"text": instructions}]
            },
        }
    }

def build_client_text_message(text: str):
    return {
        "clientContent": {
            "turns": [
                {
                    "role": "user",
                    "parts": [{"text": text}],
                }
            ],
            "turnComplete": True,
        }
    }

def normalize_gemini_server_message(raw: dict):
    events = []
    if not isinstance(raw, dict): return events

    server_content = raw.get("serverContent") or {}

    if "setupComplete" in raw or "setupComplete" in server_content:
        events.append({"type": "setup_complete", "raw": raw})

    if server_content.get("interrupted"):
        events.append({"type": "interrupted", "raw": raw})

    if server_content.get("turnComplete"):
        events.append({"type": "turn_complete", "raw": raw})

    model_turn = server_content.get("modelTurn") or {}
    parts = model_turn.get("parts") or []
    
    for part in parts:
        # Extract Transcripts - Gemini sends text naturally even if responseModalities is just AUDIO
        if "text" in part:
            events.append({
                "type": "transcript",
                "role": "ai",
                "text": part["text"]
            })
            
        # Extract Audio
        inline_data = part.get("inlineData")
        if isinstance(inline_data, dict):
            events.append({
                "type": "audio",
                "data": inline_data.get("data"),
                "mimeType": inline_data.get("mimeType", "audio/pcm;rate=24000"),
            })
            
    return events

def save_event(
    interview_id: str,
    event_type: str,
    role: str = "",
    text: str = "",
    raw_event: dict | None = None,
):
    if not interview_id:
        return

    now = utc_now()

    update = {
        "$push": {
            "gemini_events": {
                "event_type": event_type,
                "role": role,
                "text": text,
                "raw_event": raw_event or {},
                "created_at": now,
            }
        },
        "$set": {"updated_at": now},
    }

    if text and event_type in ["gemini_transcript", "typed_text"]:
        update["$push"]["transcript"] = {
            "role": role or "unknown",
            "text": text,
            "event_type": event_type,
            "created_at": now,
        }

        if role == "user":
            update["$push"]["user_answers"] = {
                "text": text,
                "created_at": now,
            }

        if role in ["assistant", "bot", "ai"]:
            update["$push"]["ai_questions"] = {
                "text": text,
                "type": "gemini_live",
                "created_at": now,
            }

    reports_collection.update_one(
        {"interview_id": interview_id},
        update,
        upsert=True,
    )

@router.post("/live/session")
async def create_gemini_live_session(req: GeminiLiveSessionRequest):
    if not GEMINI_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="GEMINI_API_KEY missing in backend .env",
        )

    if not req.user_email:
        raise HTTPException(status_code=400, detail="user_email is required")

    interview_id = req.interview_id or f"gemini_{uuid.uuid4().hex}"
    voice_name = VOICE_BY_INTERVIEWER.get(req.interviewer_voice or "male_balanced", "Puck")
    role_profile = infer_role_profile(req.role, req.interview_type, req.topics)

    reports_collection.update_one(
        {"interview_id": interview_id},
        {
            "$set": {
                "interview_id": interview_id,
                "user_email": req.user_email,
                "title": req.title,
                "interview_type": role_profile["type"],
                "resume_context": req.resume_context,
                "status": "Gemini Live Interview In Progress",
                "session_type": "gemini_live",
                "duration": f"{req.duration}:00",
                "gemini_model": GEMINI_LIVE_MODEL,
                "gemini_voice": voice_name,
                "interviewer_voice": req.interviewer_voice,
                "role_profile": role_profile,
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
                "gemini_events": [],
                "code_snapshots": [],
            },
        },
        upsert=True,
    )

    return {
        "status": "success",
        "interview_id": interview_id,
        "ws_path": f"/gemini/live/ws/{interview_id}",
        "model": GEMINI_LIVE_MODEL,
        "voice": voice_name,
        "role_profile": role_profile,
    }

@router.post("/live/event")
async def save_gemini_live_event(req: GeminiLiveEventRequest):
    if not req.interview_id:
        raise HTTPException(status_code=400, detail="interview_id is required")

    save_event(
        interview_id=req.interview_id,
        event_type=req.event_type,
        role=req.role,
        text=req.text,
        raw_event=req.raw_event,
    )

    return {"status": "saved"}

@router.post("/live/end")
async def end_gemini_live_session(req: GeminiLiveEndRequest):
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
        "message": "Gemini Live interview ended",
        "interview_id": req.interview_id,
    }

@router.websocket("/live/ws/{interview_id}")
async def gemini_live_ws(websocket: WebSocket, interview_id: str):
    await websocket.accept()

    if not GEMINI_API_KEY:
        await websocket.send_json(
            {"type": "error", "message": "GEMINI_API_KEY missing in backend .env"}
        )
        await websocket.close()
        return

    gemini_ws = None
    receive_from_gemini_task = None
    receive_from_client_task = None
    keepalive_task = None

    try:
        await websocket.send_json(
            {
                "type": "status",
                "message": "Backend WebSocket accepted. Waiting for start config...",
            }
        )

        first_message = await websocket.receive_json()

        if first_message.get("type") != "start":
            await websocket.send_json(
                {"type": "error", "message": "First WebSocket message must be type=start"}
            )
            await websocket.close()
            return

        config = first_message.get("config") or {}
        user_email = first_message.get("user_email") or config.get("user_email") or ""

        req = GeminiLiveSessionRequest(
            interview_id=interview_id,
            user_email=user_email or "unknown",
            title=config.get("title") or "Gemini Live Interview",
            interview_type=config.get("interview_type") or config.get("interviewType") or "custom",
            role=config.get("role") or "Candidate",
            company=config.get("company") or "",
            duration=int(config.get("duration") or 15),
            resume_context=config.get("resume_context") or config.get("resumeContext") or "",
            topics=config.get("topics") or "",
            difficulty=config.get("difficulty") or "medium",
            interviewer_voice=config.get("interviewer_voice")
            or config.get("interviewerVoice")
            or "male_balanced",
        )

        setup_message = build_gemini_setup_message(req)
        
        safe_api_key = urllib.parse.quote(GEMINI_API_KEY.strip().strip("'\"[]<> \n\r\t"))
        gemini_url = f"{GEMINI_WS_URL}?key={safe_api_key}"

        await websocket.send_json(
            {
                "type": "status",
                "message": f"Connecting to Gemini Live model {GEMINI_LIVE_MODEL}...",
            }
        )

        try:
            gemini_ws = await asyncio.wait_for(
                websockets.connect(
                    gemini_url,
                    max_size=25 * 1024 * 1024,
                    ping_interval=None,
                    ping_timeout=None,
                    close_timeout=10,
                ),
                timeout=15
            )
        except asyncio.TimeoutError:
            await websocket.send_json({"type": "error", "message": "Timeout connecting to Gemini."})
            await websocket.close()
            return
        except Exception as e:
            await websocket.send_json({"type": "error", "message": f"Could not connect to Gemini: {str(e)}"})
            await websocket.close()
            return

        setup_json = json.dumps(setup_message)
        
        try:
            await asyncio.wait_for(
                gemini_ws.send(setup_json),
                timeout=10
            )
        except Exception as e:
            await websocket.send_json({"type": "error", "message": f"Failed to send setup: {str(e)}"})
            await websocket.close()
            return

        await websocket.send_json(
            {
                "type": "status",
                "message": "Gemini setup sent. Waiting for setupComplete...",
                "model": GEMINI_LIVE_MODEL,
            }
        )

        async def keep_gemini_alive():
            while True:
                try:
                    await asyncio.sleep(12)
                    if not gemini_ws or gemini_ws.closed:
                        break
                    pong_waiter = await gemini_ws.ping()
                    await asyncio.wait_for(pong_waiter, timeout=10)
                    try:
                        await websocket.send_json({"type": "heartbeat", "message": "alive"})
                    except Exception:
                        pass
                except asyncio.CancelledError:
                    break
                except Exception:
                    break

        async def receive_from_gemini():
            try:
                async for raw_message in gemini_ws:
                    try:
                        gemini_data = json.loads(raw_message)
                        
                        if "error" in gemini_data:
                            error_info = gemini_data.get("error", {})
                            error_msg = error_info.get("message", str(error_info))
                            await websocket.send_json({"type": "error", "message": f"API error: {error_msg}"})
                            continue
                        
                    except Exception:
                        continue

                    normalized_events = normalize_gemini_server_message(gemini_data)

                    for event in normalized_events:
                        await websocket.send_json(event)

                        if event.get("type") == "transcript":
                            save_event(
                                interview_id=interview_id,
                                role=event.get("role", ""),
                                text=event.get("text", ""),
                                event_type="gemini_transcript",
                                raw_event=event.get("raw", {}),
                            )

            except asyncio.CancelledError:
                pass
            except Exception as e:
                try:
                    await websocket.send_json({"type": "error", "message": f"Gemini loop error: {str(e)}"})
                except Exception:
                    pass

        async def receive_from_client():
            try:
                while True:
                    client_message = await websocket.receive_json()
                    message_type = client_message.get("type")

                    if message_type == "heartbeat":
                        await websocket.send_json({"type": "heartbeat_ack", "message": "alive"})
                        continue

                    if message_type == "audio":
                        audio_b64 = client_message.get("data")
                        if not audio_b64:
                            continue

                        if gemini_ws and not gemini_ws.closed:
                            await gemini_ws.send(
                                json.dumps(
                                    {
                                        "realtimeInput": {
                                            "audio": {
                                                "mimeType": "audio/pcm;rate=16000",
                                                "data": audio_b64,
                                            }
                                        }
                                    }
                                )
                            )

                    # NEW FIX: Safely log the transcript from the browser without sending to Gemini
                    elif message_type == "user_transcript_log":
                        text = client_message.get("text", "")
                        if text:
                            save_event(interview_id, "typed_text", "user", text, client_message)

                    # Keep the regular "text" handler just in case you ever want to explicitly send text prompts later
                    elif message_type == "text":
                        text = client_message.get("text", "")
                        if not text:
                            continue

                        if gemini_ws and not gemini_ws.closed:
                            await gemini_ws.send(json.dumps(build_client_text_message(text)))

                        save_event(interview_id, "typed_text", "user", text, client_message)

                    elif message_type == "code_snapshot":
                        code = client_message.get("code", "") or ""
                        if not code.strip():
                            continue

                        # We ONLY save the code to the database for post-interview analysis.
                        # Do NOT send it to Gemini WS.
                        reports_collection.update_one(
                            {"interview_id": interview_id},
                            {
                                "$set": {
                                    "latest_code_snapshot": code,
                                    "code_snapshot": code,
                                    "updated_at": utc_now(),
                                },
                                "$push": {
                                    "code_snapshots": {
                                        "code": code[-8000:],
                                        "created_at": utc_now(),
                                    }
                                }
                            },
                            upsert=True,
                        )

                        save_event(interview_id, "code_snapshot", "system", "Code snapshot safely saved to DB without interrupting AI.", {"length": len(code)})

                    elif message_type == "end":
                        break

            except WebSocketDisconnect:
                pass
            except asyncio.CancelledError:
                pass

        keepalive_task = asyncio.create_task(keep_gemini_alive())
        receive_from_gemini_task = asyncio.create_task(receive_from_gemini())
        receive_from_client_task = asyncio.create_task(receive_from_client())

        await asyncio.wait(
            [receive_from_gemini_task, receive_from_client_task],
            return_when=asyncio.ALL_COMPLETED, 
        )

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
    finally:
        for task in [keepalive_task, receive_from_gemini_task, receive_from_client_task]:
            try:
                if task:
                    task.cancel()
            except Exception:
                pass
        try:
            if gemini_ws:
                await gemini_ws.close()
        except Exception:
            pass