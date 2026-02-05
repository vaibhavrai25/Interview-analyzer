from collections import Counter
from datetime import timedelta

def summarize_emotions(frame_emotions, fps=1):
    # Filter out 'unknown' for counting, but keep them for the timeline
    valid_emotions = [e for e in frame_emotions if e != "unknown"]
    total_valid = len(valid_emotions)

    if total_valid == 0:
        return {"error": "No faces detected in the video"}

    # 1. Percentages
    counts = Counter(valid_emotions)
    percentages = {emo: round((c / total_valid) * 100, 2) for emo, c in counts.items()}

    # 2. Dominant
    dominant = counts.most_common(1)[0][0]

    # 3. Stability (ignore 'unknown' transitions to avoid false instability)
    changes = 0
    for i in range(1, len(frame_emotions)):
        if frame_emotions[i] == "unknown" or frame_emotions[i-1] == "unknown":
            continue
        if frame_emotions[i] != frame_emotions[i-1]:
            changes += 1
    
    stability = round(100 - (changes / total_valid * 100), 2)

    # 4. Stress Timeline (Fear, Sad, Angry)
    stress_emotions = {"fear", "sad", "angry", "disgust"}
    stress_moments = []
    start = None

    for i, emo in enumerate(frame_emotions):
        if emo in stress_emotions:
            if start is None: start = i
        elif emo != "unknown": # Only end a stress moment if we see a non-stress emotion
            if start is not None:
                stress_moments.append((start, i - 1))
                start = None

    # 5. Confidence (Weighted: Neutral is very confident in interviews)
    confidence = round(percentages.get("neutral", 0) + percentages.get("happy", 0), 2)

    return {
        "dominant_emotion": dominant,
        "emotion_percentages": percentages,
        "emotional_stability": max(0, stability), # Prevent negative scores
        "confidence_score": min(100, confidence),
        "stress_timeline": [
            {"start": str(timedelta(seconds=s//fps)), "end": str(timedelta(seconds=e//fps))}
            for s, e in stress_moments
        ]
    }