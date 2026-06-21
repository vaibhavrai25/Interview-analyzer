INTERVIEW_TYPES = {
    "sde": {
        "label": "Software Engineering Interview",
        "default_role": "Software Engineer",
        "stages": [
            "intro",
            "project_deep_dive",
            "technical_depth",
            "coding_reasoning",
            "system_design",
            "behavioral",
            "wrap_up",
        ],
        "focus_areas": [
            "projects",
            "DSA",
            "OOP",
            "DBMS",
            "backend/frontend architecture",
            "system design",
            "debugging",
            "ownership",
        ],
        "style": (
            "Calm but sharp senior engineering interviewer. "
            "Ask practical questions about trade-offs, bugs, scalability, edge cases, and candidate ownership."
        ),
    },
    "hr": {
        "label": "HR Interview",
        "default_role": "Candidate",
        "stages": [
            "intro",
            "background",
            "motivation",
            "strengths_weaknesses",
            "teamwork_conflict",
            "company_fit",
            "wrap_up",
        ],
        "focus_areas": [
            "communication",
            "self-awareness",
            "motivation",
            "teamwork",
            "leadership",
            "honesty",
            "culture fit",
        ],
        "style": (
            "Warm but observant HR interviewer. "
            "Ask about motivation, self-awareness, teamwork, conflict, strengths, weaknesses, and fit."
        ),
    },
    "behavioral": {
        "label": "Behavioral Interview",
        "default_role": "Candidate",
        "stages": [
            "intro",
            "past_experience",
            "star_examples",
            "conflict",
            "leadership",
            "failure_learning",
            "wrap_up",
        ],
        "focus_areas": [
            "STAR structure",
            "specific examples",
            "ownership",
            "conflict handling",
            "learning",
            "impact",
        ],
        "style": (
            "Behavioral interviewer focused on real stories. "
            "Push candidate to answer with Situation, Task, Action, Result."
        ),
    },
    "civil": {
        "label": "Civil Engineering Interview",
        "default_role": "Civil Engineer",
        "stages": [
            "intro",
            "academic_foundation",
            "projects_internships",
            "core_concepts",
            "practical_site_questions",
            "ethics_safety",
            "wrap_up",
        ],
        "focus_areas": [
            "structural engineering",
            "geotechnical engineering",
            "transportation",
            "water resources",
            "surveying",
            "site execution",
            "safety",
        ],
        "style": (
            "Civil engineering interviewer. "
            "Ask conceptual and practical site-oriented questions with real engineering judgment."
        ),
    },
    "government": {
        "label": "Government / SSC Interview",
        "default_role": "Government Job Candidate",
        "stages": [
            "intro",
            "background",
            "general_awareness",
            "situational_judgment",
            "ethics",
            "public_service_motivation",
            "wrap_up",
        ],
        "focus_areas": [
            "general awareness",
            "ethics",
            "public service motivation",
            "decision making",
            "communication",
        ],
        "style": (
            "Formal government interview panel member. "
            "Ask balanced questions on background, awareness, ethics, and public responsibility."
        ),
    },
    "custom": {
        "label": "Custom Interview",
        "default_role": "Candidate",
        "stages": [
            "intro",
            "background",
            "domain_deep_dive",
            "practical_scenarios",
            "behavioral",
            "wrap_up",
        ],
        "focus_areas": [
            "candidate background",
            "role-specific skills",
            "practical decision making",
            "communication",
        ],
        "style": (
            "Adaptive interviewer. "
            "Use the given role and topics to ask realistic, specific, non-repetitive questions."
        ),
    },
}


def normalize_interview_type(value: str) -> str:
    raw = (value or "").strip().lower()

    if raw in INTERVIEW_TYPES:
        return raw

    if any(x in raw for x in ["sde", "software", "developer", "technical", "tech", "coding"]):
        return "sde"

    if "hr" in raw:
        return "hr"

    if "behavior" in raw or "behaviour" in raw:
        return "behavioral"

    if "civil" in raw:
        return "civil"

    if any(x in raw for x in ["ssc", "government", "govt"]):
        return "government"

    return "custom"


def get_interview_profile(interview_type: str, role: str = "", topics: str = "") -> dict:
    key = normalize_interview_type(interview_type)
    profile = INTERVIEW_TYPES.get(key, INTERVIEW_TYPES["custom"]).copy()

    profile["key"] = key
    profile["role"] = role or profile["default_role"]

    if topics:
        extra_topics = [
            item.strip()
            for item in str(topics).replace(";", ",").split(",")
            if item.strip()
        ]
        profile["focus_areas"] = list(dict.fromkeys(profile["focus_areas"] + extra_topics))

    return profile