import re
import time
from typing import Dict, List

TECH_KEYWORDS = [
    "react",
    "node",
    "express",
    "mongodb",
    "mysql",
    "postgres",
    "fastapi",
    "django",
    "flask",
    "spring",
    "jwt",
    "socket",
    "websocket",
    "redis",
    "docker",
    "kubernetes",
    "aws",
    "gcp",
    "azure",
    "cloudinary",
    "whisper",
    "opencv",
    "monaco",
    "tailwind",
    "vite",
    "api",
    "database",
    "schema",
    "authentication",
    "authorization",
    "latency",
    "scalability",
    "queue",
    "async",
    "cache",
    "microservice",
    "algorithm",
    "complexity",
    "dsa",
    "graph",
    "tree",
    "dp",
]

PROJECT_HINTS = [
    "project",
    "built",
    "made",
    "developed",
    "implemented",
    "created",
    "designed",
    "worked on",
    "hackathon",
    "analyzer",
    "platform",
    "dashboard",
    "system",
    "app",
    "website",
]


def normalize_text(text: str) -> str:
    return " ".join((text or "").strip().split())


def extract_technologies(text: str) -> List[str]:
    lower = (text or "").lower()
    found = []

    for keyword in TECH_KEYWORDS:
        if re.search(rf"\b{re.escape(keyword)}\b", lower):
            found.append(keyword)

    return list(dict.fromkeys(found))


def extract_candidate_claims(text: str) -> List[str]:
    text = normalize_text(text)
    if not text:
        return []

    sentences = re.split(r"(?<=[.!?])\s+", text)
    claims = []

    claim_patterns = [
        r"\bI built\b",
        r"\bI made\b",
        r"\bI created\b",
        r"\bI developed\b",
        r"\bI implemented\b",
        r"\bI designed\b",
        r"\bI worked\b",
        r"\bI handled\b",
        r"\bI optimized\b",
        r"\bmy project\b",
        r"\bwe built\b",
        r"\bwe used\b",
    ]

    for sentence in sentences:
        lower = sentence.lower()
        if any(re.search(pattern, lower, re.IGNORECASE) for pattern in claim_patterns):
            clean = sentence.strip()
            if 8 <= len(clean.split()) <= 45:
                claims.append(clean)

    if not claims and any(hint in text.lower() for hint in PROJECT_HINTS):
        words = text.split()
        claims.append(" ".join(words[:45]))

    return claims[:5]


def detect_answer_type(text: str) -> str:
    lower = (text or "").lower()
    words = lower.split()

    if len(words) <= 6:
        return "short"

    if any(x in lower for x in ["my name", "i am", "i'm", "currently", "student", "college"]):
        return "intro"

    if any(x in lower for x in PROJECT_HINTS):
        return "project"

    if any(x in lower for x in ["time complexity", "space complexity", "algorithm", "edge case", "dsa"]):
        return "technical"

    if any(x in lower for x in ["conflict", "team", "lead", "failure", "challenge", "mistake"]):
        return "behavioral"

    return "general"


def create_memory(config: dict = None) -> Dict:
    config = config or {}

    return {
        "created_at": time.time(),
        "turn_count": 0,
        "current_stage": "intro",
        "current_topic": None,
        "candidate_claims": [],
        "technologies": [],
        "projects": [],
        "asked_questions": [],
        "strong_signals": [],
        "weak_signals": [],
        "last_user_answer": "",
        "last_ai_question": "",
        "conversation_summary": "",
        "interview_type": config.get("interview_type") or config.get("interviewType") or "sde",
        "role": config.get("role") or "Software Engineer",
        "company": config.get("company") or "the company",
        "topics": config.get("topics") or "",
    }


def update_memory(memory: Dict, user_text: str, ai_question: str = "") -> Dict:
    user_text = normalize_text(user_text)
    ai_question = normalize_text(ai_question)

    memory["turn_count"] = memory.get("turn_count", 0) + 1
    memory["last_user_answer"] = user_text

    if ai_question:
        memory["last_ai_question"] = ai_question
        memory.setdefault("asked_questions", []).append(ai_question)

    claims = extract_candidate_claims(user_text)
    for claim in claims:
        if claim not in memory.setdefault("candidate_claims", []):
            memory["candidate_claims"].append(claim)

    techs = extract_technologies(user_text)
    for tech in techs:
        if tech not in memory.setdefault("technologies", []):
            memory["technologies"].append(tech)

    answer_type = detect_answer_type(user_text)

    if answer_type == "project":
        memory["current_stage"] = "project_deep_dive"
        if claims:
            memory["current_topic"] = claims[0][:120]

    elif answer_type == "technical":
        memory["current_stage"] = "technical_depth"

    elif answer_type == "behavioral":
        memory["current_stage"] = "behavioral"

    elif memory["turn_count"] >= 6 and memory["current_stage"] in ["intro", "project_deep_dive"]:
        memory["current_stage"] = "technical_depth"

    if len(user_text.split()) < 15:
        memory.setdefault("weak_signals", []).append("Short answer; needs elaboration.")

    if len(user_text.split()) >= 50:
        memory.setdefault("strong_signals", []).append("Detailed answer with reasonable context.")

    memory["candidate_claims"] = memory.get("candidate_claims", [])[-10:]
    memory["asked_questions"] = memory.get("asked_questions", [])[-15:]
    memory["strong_signals"] = memory.get("strong_signals", [])[-10:]
    memory["weak_signals"] = memory.get("weak_signals", [])[-10:]

    return memory


def compact_memory_for_prompt(memory: Dict) -> str:
    claims = memory.get("candidate_claims", [])[-5:]
    techs = memory.get("technologies", [])[-10:]
    asked = memory.get("asked_questions", [])[-5:]
    strong = memory.get("strong_signals", [])[-3:]
    weak = memory.get("weak_signals", [])[-3:]

    return f"""
Memory:
- Current stage: {memory.get("current_stage")}
- Current topic: {memory.get("current_topic")}
- Candidate claims: {claims}
- Technologies mentioned: {techs}
- Recently asked questions: {asked}
- Strong signals: {strong}
- Weak signals: {weak}
""".strip()