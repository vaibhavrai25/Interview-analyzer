RUBRIC_BY_TYPE = {
    "sde": {
        "clarity": "Explains approach clearly and in structured steps.",
        "technical_depth": "Uses correct technical concepts, complexity, edge cases, trade-offs.",
        "specificity": "Gives concrete project/code details instead of vague claims.",
        "ownership": "Clearly explains personal contribution and decisions.",
        "problem_solving": "Shows debugging, design, and reasoning ability.",
    },
    "hr": {
        "clarity": "Communicates directly and confidently.",
        "self_awareness": "Understands strengths, weaknesses, motivations.",
        "honesty": "Answers realistically without overclaiming.",
        "fit": "Connects goals with role/company.",
        "examples": "Uses real examples rather than generic answers.",
    },
    "behavioral": {
        "star_structure": "Uses Situation, Task, Action, Result structure.",
        "specificity": "Gives real stories with context and measurable impact.",
        "ownership": "Explains personal responsibility and decisions.",
        "reflection": "Shows what was learned from the situation.",
        "communication": "Keeps answer concise and structured.",
    },
    "civil": {
        "conceptual_clarity": "Explains core civil engineering concepts correctly.",
        "practical_judgment": "Applies theory to site/practical situations.",
        "safety_ethics": "Considers safety, ethics, and standards.",
        "specificity": "Uses examples from projects, labs, or internships.",
        "communication": "Explains technical ideas clearly.",
    },
    "government": {
        "awareness": "Shows awareness of society, governance, and current context.",
        "ethics": "Gives balanced and ethical responses.",
        "public_service": "Shows motivation for public responsibility.",
        "judgment": "Handles situational questions calmly.",
        "communication": "Answers formally and clearly.",
    },
    "custom": {
        "clarity": "Communicates clearly.",
        "specificity": "Uses concrete examples.",
        "role_fit": "Answers according to the role.",
        "reasoning": "Shows structured thinking.",
        "confidence": "Sounds confident without exaggeration.",
    },
}


def get_rubric(interview_type: str) -> dict:
    key = (interview_type or "custom").strip().lower()
    return RUBRIC_BY_TYPE.get(key, RUBRIC_BY_TYPE["custom"])


def score_answer_heuristic(answer: str, interview_type: str = "custom") -> dict:
    text = (answer or "").strip()
    words = text.split()
    lower = text.lower()

    score = 5
    strengths = []
    weaknesses = []

    if len(words) >= 60:
        score += 1
        strengths.append("Gave a detailed answer.")
    elif len(words) < 15:
        score -= 1
        weaknesses.append("Answer was too short and needs more detail.")

    specific_markers = [
        "i built",
        "i implemented",
        "i designed",
        "i handled",
        "i optimized",
        "because",
        "for example",
        "the result",
        "we used",
        "i used",
    ]

    if any(marker in lower for marker in specific_markers):
        score += 1
        strengths.append("Used specific implementation or reasoning details.")
    else:
        weaknesses.append("Needs more concrete examples and personal contribution.")

    technical_markers = [
        "api",
        "database",
        "latency",
        "scalability",
        "complexity",
        "cache",
        "mongodb",
        "react",
        "fastapi",
        "queue",
        "async",
        "algorithm",
        "edge case",
        "schema",
    ]

    if interview_type == "sde" and any(marker in lower for marker in technical_markers):
        score += 1
        strengths.append("Mentioned relevant technical concepts.")

    filler_words = ["umm", "uh", "like like", "you know", "basically basically"]
    if any(filler in lower for filler in filler_words):
        score -= 1
        weaknesses.append("Contains filler or hesitation patterns.")

    score = max(1, min(10, score))

    return {
        "score": score,
        "strengths": strengths,
        "weaknesses": weaknesses,
    }