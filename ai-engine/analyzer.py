import spacy
import textstat
from collections import Counter

nlp = spacy.load("en_core_web_sm")

FILLER_WORDS = ["um", "uh", "like", "you know", "so", "actually", "basically"]

TECH_WORDS = [
    "python", "java", "arduino", "iot", "machine learning",
    "database", "api", "react", "node", "algorithm", "data structure"
]

ACTION_VERBS = ["built", "created", "developed", "implemented", "designed", "optimized"]
WEAK_PHRASES = ["i think", "maybe", "probably", "sort of", "kind of"]

CONNECTORS = ["because", "therefore", "however", "so", "then", "while", "although"]
STAR_WORDS = ["situation", "task", "action", "result"]
HEDGES = ["maybe", "perhaps", "might", "could"]


def analyze_text(text):
    doc = nlp(text)
    words = [token.text.lower() for token in doc if token.is_alpha]
    total_words = len(words)

    sentences = list(doc.sents)

    # ---------------- Basic Metrics ----------------
    filler_count = sum(words.count(fw) for fw in FILLER_WORDS)
    unique_words = len(set(words))
    vocab_richness = unique_words / max(total_words, 1)

    word_freq = Counter(words)
    repeated_word_types = sum(1 for w, c in word_freq.items() if c > 3)

    avg_sentence_length = total_words / max(len(sentences), 1)

    passive_sentences = 0
    for sent in sentences:
        for token in sent:
            if token.dep_ == "auxpass":
                passive_sentences += 1
                break

    tech_count = sum(text.lower().count(tw) for tw in TECH_WORDS)
    readability = textstat.flesch_reading_ease(text)

    # ---------------- Advanced NLP Signals ----------------
    pos_tags = [token.pos_ for token in doc]
    pos_diversity = len(set(pos_tags))

    action_verb_count = sum(text.lower().count(v) for v in ACTION_VERBS)
    weak_phrase_count = sum(text.lower().count(wp) for wp in WEAK_PHRASES)
    first_person_count = text.lower().count("i ")

    numeric_count = len([token for token in doc if token.like_num])

    starters = [
        sent.text.strip().split()[0].lower()
        for sent in sentences
        if len(sent.text.split()) > 0
    ]
    starter_variety = len(set(starters))

    # ---- NEW DEPTH FEATURES ----
    connector_count = sum(text.lower().count(c) for c in CONNECTORS)

    sentence_lengths = [len(sent.text.split()) for sent in sentences]
    length_variance = max(sentence_lengths) - min(sentence_lengths) if sentence_lengths else 0

    freq = Counter(words)
    repeated_words = [w for w, c in freq.items() if c > 5]

    star_count = sum(text.lower().count(w) for w in STAR_WORDS)

    hedge_count = sum(text.lower().count(h) for h in HEDGES)

    # ---------------- Category Scores ----------------
    communication_score = 10
    confidence_score = 10
    technical_score = min(tech_count * 2, 10)

    problems = []
    suggestions = []

    # ---------------- Existing deductions ----------------
    if filler_count > 3:
        confidence_score -= 3
        problems.append("Too many filler words used")
        suggestions.append("Practice speaking slowly and avoid filler words")

    if repeated_word_types > 2:
        communication_score -= 2

    if avg_sentence_length > 25:
        communication_score -= 2

    if readability < 50:
        communication_score -= 2
        problems.append("Sentences are hard to understand")
        suggestions.append("Keep sentences short and clear")

    if passive_sentences > 2:
        communication_score -= 2
        problems.append("Frequent use of passive voice")
        suggestions.append("Use active voice")

    if vocab_richness < 0.4:
        problems.append("Limited vocabulary usage")
        suggestions.append("Use more varied words")

    if tech_count == 0:
        problems.append("Lack of technical terms")
        suggestions.append("Mention tools, technologies, or concepts used")

    # ---------------- Advanced deductions ----------------
    if action_verb_count < 2:
        communication_score -= 2
        problems.append("Lack of impactful action verbs")
        suggestions.append("Use words like built, developed, designed")

    if weak_phrase_count > 1:
        confidence_score -= 2
        problems.append("Use of weak phrases reducing confidence")
        suggestions.append("Avoid phrases like 'I think', 'maybe'")

    if first_person_count < 2:
        problems.append("Low ownership in explanation")
        suggestions.append("Use 'I did', 'I built'")

    if numeric_count == 0:
        problems.append("No specific numbers mentioned")
        suggestions.append("Add measurable numbers to answers")

    if starter_variety < 3:
        problems.append("Sentences start similarly")
        suggestions.append("Vary sentence starters")

    if pos_diversity < 8:
        communication_score -= 2

    # -------- NEW PSYCHOLOGY / STRUCTURE CHECKS --------
    if connector_count < 2:
        problems.append("Lack of logical connectors")
        suggestions.append("Use words like because, therefore, however")

    if length_variance < 5:
        problems.append("Monotonous sentence lengths")
        suggestions.append("Vary sentence lengths")

    if repeated_words:
        problems.append(f"Repetition of words: {', '.join(repeated_words[:3])}")
        suggestions.append("Avoid repeating the same words frequently")

    if star_count < 2:
        problems.append("Answer not following STAR method")
        suggestions.append("Structure answers as Situation, Task, Action, Result")

    if hedge_count > 2:
        confidence_score -= 2
        problems.append("Too much hedging language")
        suggestions.append("Be more assertive")

    if total_words > 120 and len(sentences) < 5:
        problems.append("Rambling explanation without breaks")
        suggestions.append("Break thoughts into clear sentences")

    # ---------------- Final Scores ----------------
    communication_score = max(communication_score, 1)
    confidence_score = max(confidence_score, 1)

    final_score = int((communication_score + confidence_score + technical_score) / 3 * 10)

    return {
        "communication_score": communication_score,
        "confidence_score": confidence_score,
        "technical_depth_score": technical_score,
        "final_interview_score": final_score,
        "problems_detected": problems,
        "suggestions": suggestions
    }
    