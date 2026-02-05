import spacy
import textstat
from collections import Counter
import re

# Load model once
nlp = spacy.load("en_core_web_sm")

# --- Optimized Configuration (Combined from both branches) ---
# Using sets for O(1) lookup speed
FILLER_WORDS = {"um", "uh", "like", "you know", "so", "actually", "basically"}
TECH_WORDS = {
    "python", "java", "arduino", "iot", "machine learning",
    "database", "api", "react", "node", "algorithm", "data structure"
]

ACTION_VERBS = ["built", "created", "developed", "implemented", "designed", "optimized"]
WEAK_PHRASES = ["i think", "maybe", "probably", "sort of", "kind of"]

CONNECTORS = ["because", "therefore", "however", "so", "then", "while", "although"]
STAR_WORDS = ["situation", "task", "action", "result","team"]
HEDGES = ["maybe", "perhaps", "might", "could"]


def analyze_text(text):
    if not text.strip():
        return {"error": "Empty transcript"}

    doc = nlp(text)
    # Filter for actual words (alphabetic)
    tokens = [token for token in doc if token.is_alpha]
    words_lower = [t.text.lower() for t in tokens]
    total_words = len(words_lower)
    sentences = list(doc.sents)

    # 1. Frequency Analysis (Helper for specific phrase detection)
    def count_keywords(word_list):
        count = 0
        for word in word_list:
            # \b ensures we don't match 'react' inside 'reaction'
            pattern = rf"\b{re.escape(word)}\b"
            count += len(re.findall(pattern, text.lower()))
        return count

    # ---------------- Metrics ----------------
    filler_count = sum(1 for w in words_lower if w in FILLER_WORDS)
    tech_count = sum(1 for w in words_lower if w in TECH_WORDS)
    action_verb_count = sum(1 for w in words_lower if w in ACTION_VERBS)
    weak_phrase_count = count_keywords(WEAK_PHRASES)
    
    # Vocabulary Richness
    vocab_richness = len(set(words_lower)) / max(total_words, 1)
    
    # Passive Voice Detection
    passive_count = sum(1 for sent in sentences if any(t.dep_ == "auxpass" for t in sent))

    # ---------------- Scoring Logic ----------------
    comm_score = 10
    conf_score = 10
    # Technical score scales based on keyword usage
    tech_score = min(tech_count * 2, 10)
    
    problems, suggestions = [], []

    # Filler word deduction (Industry standard: > 5% fillers shows lack of preparation)
    if (filler_count / max(total_words, 1)) > 0.05:
        conf_score -= 3
        problems.append("High usage of filler words")
        suggestions.append("Try to pause instead of using 'um' or 'uh' to sound more composed.")

    # Weak phrases/Hedges deduction
    if weak_phrase_count > 2:
        conf_score -= 2
        problems.append("Frequent use of hedging (e.g., 'I think', 'maybe')")
        suggestions.append("Use more definitive language. Replace 'I think I did' with 'I implemented'.")

    # Passive voice deduction
    if passive_count > 1:
        comm_score -= 2
        problems.append("Passive voice detected")
        suggestions.append("Use active verbs (e.g., 'I managed' instead of 'It was managed by me') to show ownership.")

    # STAR Method Check
    star_hits = sum(1 for w in STAR_WORDS if w in text.lower())
    if star_hits < 2:
        problems.append("Structure: Answer may lack STAR format")
        suggestions.append("Explicitly mention the Situation, Task, Action, and Result in your stories.")

    # Final Calculation (Scale of 0-100)
    final_score = int(((comm_score + conf_score + tech_score) / 3) * 10)

    return {
        "communication_score": max(comm_score, 1),
        "confidence_score": max(conf_score, 1),
        "technical_depth_score": tech_score,
        "final_interview_score": final_score,
        "problems_detected": problems,
        "suggestions": suggestions
    }
    
