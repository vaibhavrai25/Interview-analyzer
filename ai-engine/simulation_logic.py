import os
import time
import asyncio
import hashlib

from groq import Groq
from dotenv import load_dotenv

from database import reports_collection
from conversation_memory import create_memory, update_memory
from interview_brain import build_interviewer_prompt, sanitize_ai_question

load_dotenv()

client = Groq(api_key=os.getenv("GROQ_API_KEY"))

sessions = {}

CODE_MIN_LENGTH = 80
CODE_ANALYSIS_COOLDOWN_SECONDS = 18
VOICE_MIN_LENGTH = 4
GROQ_TIMEOUT_SECONDS = int(os.getenv("GROQ_TIMEOUT_SECONDS", "13"))

QUALITY_MODEL = os.getenv("GROQ_INTERVIEW_MODEL", "llama-3.3-70b-versatile")
FAST_FALLBACK_MODEL = os.getenv("GROQ_FAST_MODEL", "llama-3.1-8b-instant")


def now_ts():
    return time.time()


def normalize_text(text):
    return " ".join((text or "").lower().strip().split())


def stable_hash(text):
    return hashlib.sha256((text or "").encode("utf-8")).hexdigest()


def get_session(sid, config=None):
    config = config or {}

    if sid not in sessions:
        memory = create_memory(config)

        sessions[sid] = {
            "memory": memory,
            "history": [],
            "last_ai_message": "",
            "last_user_message": "",
            "voice_locked": False,
            "code_locked": False,
            "last_code_hash": "",
            "last_code_analysis_at": 0,
            "latest_code": "",
            "last_activity_at": now_ts(),
        }

    return sessions[sid]


def cleanup_session(sid):
    sessions.pop(sid, None)


def is_echo(user_text, last_ai_message):
    user_norm = normalize_text(user_text)
    ai_norm = normalize_text(last_ai_message)

    if not user_norm or not ai_norm:
        return False

    if len(user_norm) < 10:
        return False

    return ai_norm in user_norm or user_norm in ai_norm


def is_duplicate_answer(user_text, last_user_message):
    user_norm = normalize_text(user_text)
    last_norm = normalize_text(last_user_message)

    if not user_norm or not last_norm:
        return False

    return user_norm == last_norm


async def groq_chat_completion(messages, model=None, temperature=0.38, max_tokens=90, timeout=None):
    model = model or QUALITY_MODEL
    timeout = timeout or GROQ_TIMEOUT_SECONDS

    def _call_groq():
        return client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )

    return await asyncio.wait_for(asyncio.to_thread(_call_groq), timeout=timeout)


async def groq_with_fallback(messages, fallback_text, temperature=0.42, max_tokens=90):
    try:
        response = await groq_chat_completion(
            messages=messages,
            model=QUALITY_MODEL,
            temperature=temperature,
            max_tokens=max_tokens,
            timeout=GROQ_TIMEOUT_SECONDS,
        )
        return response.choices[0].message.content.strip()

    except asyncio.TimeoutError:
        print(" Quality model timeout. Trying fast fallback model...")

    except Exception as e:
        print(f" Quality model failed: {e}. Trying fast fallback model...")

    try:
        response = await groq_chat_completion(
            messages=messages,
            model=FAST_FALLBACK_MODEL,
            temperature=temperature,
            max_tokens=max_tokens,
            timeout=7,
        )
        return response.choices[0].message.content.strip()

    except Exception as e:
        print(f" Fast fallback model failed: {e}")

    return fallback_text


def save_user_answer(interview_id, user_text, current_code):
    if not interview_id:
        return

    try:
        reports_collection.update_one(
            {"interview_id": interview_id},
            {
                "$set": {
                    "interview_id": interview_id,
                    "status": "Live Interview In Progress",
                    "session_type": "live",
                    "updated_at": now_ts(),
                    "latest_code_snapshot": current_code,
                    "code_snapshot": current_code,
                },
                "$push": {
                    "user_answers": {
                        "text": user_text,
                        "created_at": now_ts(),
                    }
                },
            },
            upsert=True,
        )
    except Exception as e:
        print(f"Mongo save_user_answer error: {e}")


def save_ai_question(interview_id, text, current_code, question_type="voice"):
    if not interview_id:
        return

    try:
        reports_collection.update_one(
            {"interview_id": interview_id},
            {
                "$push": {
                    "ai_questions": {
                        "text": text,
                        "type": question_type,
                        "created_at": now_ts(),
                    }
                },
                "$set": {
                    "latest_code_snapshot": current_code,
                    "code_snapshot": current_code,
                    "updated_at": now_ts(),
                },
            },
            upsert=True,
        )
    except Exception as e:
        print(f"Mongo save_ai_question error: {e}")


def save_structured_turn(interview_id, turn_payload):
    if not interview_id:
        return

    try:
        reports_collection.update_one(
            {"interview_id": interview_id},
            {
                "$push": {
                    "structured_turns": turn_payload
                },
                "$set": {
                    "updated_at": now_ts(),
                    "interview_memory": turn_payload.get("memory_snapshot", {}),
                },
            },
            upsert=True,
        )
    except Exception as e:
        print(f"Mongo save_structured_turn error: {e}")


async def handle_code_update(sid, data, sio):
    data = data or {}
    code = data.get("code", "") or ""
    config = data.get("config", {}) or {}

    session = get_session(sid, config)
    session["latest_code"] = code
    session["last_activity_at"] = now_ts()

    clean_code = code.strip()

    if len(clean_code) < CODE_MIN_LENGTH:
        return

    code_hash = stable_hash(clean_code)
    current_time = now_ts()

    if code_hash == session["last_code_hash"]:
        return

    if current_time - session["last_code_analysis_at"] < CODE_ANALYSIS_COOLDOWN_SECONDS:
        return

    if session["voice_locked"] or session["code_locked"]:
        return

    session["code_locked"] = True
    session["last_code_hash"] = code_hash
    session["last_code_analysis_at"] = current_time

    try:
        memory = session["memory"]

        messages = [
            {
                "role": "system",
                "content": (
                    "You are a senior interviewer watching the candidate code. "
                    "Only interrupt if there is a clear bug, bad complexity, missing edge case, or useful interview nudge. "
                    "If no interruption is needed, respond exactly: SILENCE."
                ),
            },
            {
                "role": "user",
                "content": f"""
Current interview memory:
{memory}

Candidate code snapshot:
{clean_code[:1400]}

Return either SILENCE or one short interviewer question under 24 words.
""",
            },
        ]

        response_text = await groq_with_fallback(
            messages,
            fallback_text="SILENCE",
            temperature=0.25,
            max_tokens=60,
        )

        text = response_text.strip()

        if text and "SILENCE" not in text.upper():
            text = sanitize_ai_question(text, "Can you explain the edge case your current code might miss?")
            session["last_ai_message"] = text
            session["history"].append({"role": "assistant", "content": text})

            await sio.emit(
                "ai_question",
                {"text": text, "source": "code_review"},
                to=sid,
            )

    except Exception as e:
        print(f"Code Update Error for sid={sid}: {e}")

    finally:
        session["code_locked"] = False


async def handle_user_answer(sid, data, sio):
    data = data or {}

    user_text = (data.get("text") or "").strip()
    current_code = data.get("code", "") or ""
    config = data.get("config", {}) or {}
    interview_id = config.get("interview_id")

    session = get_session(sid, config)
    session["last_activity_at"] = now_ts()

    if len(user_text) < VOICE_MIN_LENGTH:
        return

    if is_echo(user_text, session.get("last_ai_message", "")):
        return

    if is_duplicate_answer(user_text, session.get("last_user_message", "")):
        return

    if session["voice_locked"]:
        return

    session["voice_locked"] = True

    try:
        session["last_user_message"] = user_text

        save_user_answer(interview_id, user_text, current_code)

        # First update memory with user answer.
        memory = update_memory(session["memory"], user_text)
        session["memory"] = memory

        brain_payload = build_interviewer_prompt(
            memory=memory,
            user_text=user_text,
            current_code=current_code,
            config=config,
        )

        messages = [
            {"role": "system", "content": brain_payload["system_prompt"]},
        ]

        # Keep recent conversational continuity.
        recent_history = session["history"][-8:]
        messages.extend(recent_history)

        messages.append({"role": "user", "content": brain_payload["user_prompt"]})

        raw_text = await groq_with_fallback(
            messages=messages,
            fallback_text=brain_payload["fallback"],
            temperature=0.43,
            max_tokens=95,
        )

        text = sanitize_ai_question(raw_text, brain_payload["fallback"])

        # Update memory with AI question too.
        memory = update_memory(session["memory"], user_text, ai_question=text)
        session["memory"] = memory

        session["last_ai_message"] = text
        session["history"].append({"role": "user", "content": user_text})
        session["history"].append({"role": "assistant", "content": text})

        if len(session["history"]) > 18:
            session["history"] = session["history"][-18:]

        save_ai_question(interview_id, text, current_code, question_type="voice")

        save_structured_turn(
            interview_id,
            {
                "turn": memory.get("turn_count"),
                "created_at": now_ts(),
                "user_answer": user_text,
                "ai_question": text,
                "action": brain_payload.get("action"),
                "heuristic": brain_payload.get("heuristic"),
                "interview_type": brain_payload.get("interview_type"),
                "code_snapshot": current_code[-3000:] if current_code else "",
                "memory_snapshot": {
                    "current_stage": memory.get("current_stage"),
                    "current_topic": memory.get("current_topic"),
                    "candidate_claims": memory.get("candidate_claims", [])[-5:],
                    "technologies": memory.get("technologies", [])[-10:],
                    "strong_signals": memory.get("strong_signals", [])[-5:],
                    "weak_signals": memory.get("weak_signals", [])[-5:],
                    "asked_questions": memory.get("asked_questions", [])[-8:],
                },
            },
        )

        await sio.emit(
            "ai_question",
            {
                "text": text,
                "source": "voice_response",
                "action": brain_payload.get("action"),
                "stage": memory.get("current_stage"),
            },
            to=sid,
        )

    except Exception as e:
        print(f"Voice Answer Error for sid={sid}: {e}")

        fallback = "Can you explain that with one specific example and your exact contribution?"

        await sio.emit(
            "server_warning",
            {
                "source": "user_answer",
                "message": "Temporary interview engine issue. Continuing with fallback question.",
                "fallback_question": fallback,
            },
            to=sid,
        )

    finally:
        session["voice_locked"] = False