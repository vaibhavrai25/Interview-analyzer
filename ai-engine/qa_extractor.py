import spacy

# Load spaCy for sentence segmentation
nlp = spacy.load("en_core_web_sm")

def extract_qa_pairs(transcript: str):
    """
    Splits a raw transcript into a list of Question and Answer pairs.
    """
    if not transcript or len(transcript.strip()) == 0:
        return []

    doc = nlp(transcript)
    sentences = [sent.text.strip() for sent in doc.sents]

    qa_pairs = []
    current_question = ""
    current_answer = []

    # Keywords that often start an interviewer's question
    question_starters = (
        "how", "why", "what", "where", "when", "tell", "describe", 
        "could", "can", "would", "do", "did", "share"
    )

    for sent in sentences:
        sent_lower = sent.lower()
        
        # Logic: If it ends with '?' or starts with a question word, it's likely a question
        is_question = sent.endswith("?") or sent_lower.startswith(question_starters)

        if is_question:
            # If we were already building an answer for a previous question, save it
            if current_question and current_answer:
                qa_pairs.append({
                    "question": current_question,
                    "answer": " ".join(current_answer)
                })
                current_answer = [] # Reset for next pair

            current_question = sent
        else:
            # If it's not a question, it must be part of the answer
            if current_question:
                current_answer.append(sent)

    # Add the final pair to the list
    if current_question and current_answer:
        qa_pairs.append({
            "question": current_question,
            "answer": " ".join(current_answer)
        })

    # Fallback: If no questions were detected, treat the whole thing as one answer
    if not qa_pairs and transcript:
        qa_pairs.append({
            "question": "General Interview Context",
            "answer": transcript
        })

    return qa_pairs