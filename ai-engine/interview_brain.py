import json
import re

from conversation_memory import (
    compact_memory_for_prompt,
    detect_answer_type,
    extract_technologies,
)
from interview_types import get_interview_profile, normalize_interview_type
from rubrics import get_rubric, score_answer_heuristic


def choose_next_action(memory: dict, user_text: str, config: dict = None) -> str:
    config = config or {}
    answer_type = detect_answer_type(user_text)
    lower = (user_text or "").lower()
    turn = memory.get("turn_count", 0)
    stage = memory.get("current_stage", "intro")

    if answer_type == "short":
        return "ASK_CLARIFICATION"

    if turn <= 1:
        if answer_type in ["intro", "project"]:
            return "ASK_PROJECT_SELECTION"
        return "ASK_BACKGROUND_FOLLOWUP"

    if answer_type == "project":
        if any(x in lower for x in ["latency", "scale", "performance", "realtime", "real-time"]):
            return "ASK_PERFORMANCE_TRADEOFF"
        if any(x in lower for x in ["database", "mongodb", "schema", "sql"]):
            return "ASK_DATABASE_DESIGN"
        if any(x in lower for x in ["auth", "jwt", "login", "security"]):
            return "ASK_SECURITY_DECISION"
        return "ASK_PROJECT_DEEP_DIVE"

    if answer_type == "technical":
        return "ASK_EDGE_CASE_OR_COMPLEXITY"

    if answer_type == "behavioral":
        return "ASK_STAR_DEPTH"

    if stage == "technical_depth":
        return "ASK_TECHNICAL_REASONING"

    if turn >= 5 and normalize_interview_type(config.get("interview_type") or config.get("interviewType")) == "sde":
        return "MOVE_TO_TECHNICAL"

    return "ASK_SPECIFIC_EXAMPLE"


def fallback_question(action: str, memory: dict, user_text: str) -> str:
    techs = memory.get("technologies", [])
    topic = memory.get("current_topic") or "that project"

    if action == "ASK_CLARIFICATION":
        return "Can you expand that with one concrete example and your exact role?"

    if action == "ASK_PROJECT_SELECTION":
        return "Good. Which project should we go deeper into, and what was your exact contribution?"

    if action == "ASK_PERFORMANCE_TRADEOFF":
        return "You mentioned performance. What was the biggest latency bottleneck, and how did you reduce it?"

    if action == "ASK_DATABASE_DESIGN":
        return "How did you design the database schema, and what query became most performance-critical?"

    if action == "ASK_SECURITY_DECISION":
        return "How did you handle authentication securely, and what failure cases did you consider?"

    if action == "ASK_PROJECT_DEEP_DIVE":
        return f"Let’s go deeper into {topic}. What was the hardest technical decision you personally made?"

    if action == "ASK_EDGE_CASE_OR_COMPLEXITY":
        return "What edge case or complexity issue would you expect an interviewer to challenge in this solution?"

    if action == "ASK_STAR_DEPTH":
        return "Can you explain that using Situation, Task, Action, and Result clearly?"

    if action == "MOVE_TO_TECHNICAL":
        if techs:
            return f"Let’s move technical. You mentioned {techs[-1]}; what trade-off did you face while using it?"
        return "Let’s move technical. Explain one design trade-off from your strongest project."

    if action == "ASK_TECHNICAL_REASONING":
        return "What alternatives did you consider, and why did you reject them?"

    return "Can you give one specific example with the problem, your action, and the final result?"


def build_interviewer_prompt(
    memory: dict,
    user_text: str,
    current_code: str = "",
    config: dict = None,
) -> dict:
    config = config or {}

    interview_type = normalize_interview_type(
        config.get("interview_type") or config.get("interviewType") or memory.get("interview_type") or "sde"
    )

    role = config.get("role") or memory.get("role") or ""
    company = config.get("company") or memory.get("company") or "the company"
    topics = config.get("topics") or memory.get("topics") or ""
    difficulty = config.get("difficulty") or "medium"

    profile = get_interview_profile(interview_type, role=role, topics=topics)
    rubric = get_rubric(interview_type)
    heuristic = score_answer_heuristic(user_text, interview_type)
    action = choose_next_action(memory, user_text, config)
    fallback = fallback_question(action, memory, user_text)

    memory_block = compact_memory_for_prompt(memory)

    system_prompt = f"""
You are Jarvis, a realistic human interviewer for {profile["label"]}.
Company/context: {company}
Role: {profile["role"]}
Difficulty: {difficulty}

Interviewer style:
{profile["style"]}

You are not a chatbot. You are a real interviewer.
Your job is to listen, remember, and ask the next most useful question.

Rules:
- Ask exactly ONE question.
- Keep it conversational, natural, and specific.
- Reference something the candidate actually said.
- Do not sound generic.
- Do not say "as an AI".
- Do not lecture or give long feedback during the interview.
- Do not repeat any recently asked question.
- If the answer was vague, ask for concrete details.
- If the answer was strong, go deeper with a sharper follow-up.
- Keep response under 32 words.
"""

    user_prompt = f"""
Interview profile:
- Type: {profile["label"]}
- Focus areas: {profile["focus_areas"]}
- Current action: {action}
- Rubric: {json.dumps(rubric, ensure_ascii=False)}
- Heuristic answer score: {heuristic}

{memory_block}

Candidate's latest answer:
\"\"\"{user_text[:2200]}\"\"\"

Current code snapshot, if relevant:
\"\"\"{current_code[:900]}\"\"\"

Generate Jarvis's next spoken interviewer response.
It must be one short natural response ending with one question.

Fallback question if model is uncertain:
{fallback}
"""

    return {
        "system_prompt": system_prompt.strip(),
        "user_prompt": user_prompt.strip(),
        "action": action,
        "fallback": fallback,
        "heuristic": heuristic,
        "interview_type": interview_type,
    }


def sanitize_ai_question(text: str, fallback: str) -> str:
    text = (text or "").strip()

    if not text:
        return fallback

    text = re.sub(r"^(jarvis\s*:|interviewer\s*:)\s*", "", text, flags=re.IGNORECASE).strip()

    if "as an ai" in text.lower():
        return fallback

    # Keep first 2 sentences max to avoid lectures.
    parts = re.split(r"(?<=[.!?])\s+", text)
    if len(parts) > 2:
        text = " ".join(parts[:2]).strip()

    words = text.split()
    if len(words) > 42:
        text = " ".join(words[:42]).strip()
        if not text.endswith("?"):
            text += "?"

    if "?" not in text:
        text = text.rstrip(".") + "?"

    return text