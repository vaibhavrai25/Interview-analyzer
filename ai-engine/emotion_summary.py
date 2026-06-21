from collections import Counter
from datetime import timedelta

def summarize_emotions(frame_emotions, fps=1):
    """
    Analyzes a list of emotions detected per frame/second.
    frame_emotions: list of strings (e.g., ["happy", "neutral", "unknown", "sad"...])
    """
    # Filter out 'unknown' for global stats calculations
    valid_emotions = [e for e in frame_emotions if e != "unknown"]
    total_frames = len(frame_emotions)
    total_valid = len(valid_emotions)

    if total_valid == 0:
        return {"error": "No faces detected in the video"}

    # 1. Global Percentages (For the Cards)
    counts = Counter(valid_emotions)
    global_percentages = {emo: round((c / total_valid) * 100, 2) for emo, c in counts.items()}

    # 2. Dominant Emotion
    dominant = counts.most_common(1)[0][0]

    # 3. 📊 NEW: Time-Series Timeline (For the Recharts Chart)
    # This creates a data point for every second so the chart has a 'path'
    timeline_data = {}
    ALL_EMOTIONS = ["happy", "neutral", "sad", "surprise", "angry", "disgust", "fear"]
    
    for i, emo in enumerate(frame_emotions):
        # Convert frame index to MM:SS format
        seconds = i // fps
        timestamp = f"{seconds // 60:02d}:{seconds % 60:02d}"
        
        # In a real per-second timeline, we mark the detected emotion as 100% 
        # for that specific second to create the area chart flow.
        if emo != "unknown":
            entry = {e: 0 for e in ALL_EMOTIONS}
            entry[emo] = 100
            timeline_data[timestamp] = entry

    # 4. Stability Calculation
    changes = 0
    for i in range(1, len(frame_emotions)):
        if frame_emotions[i] == "unknown" or frame_emotions[i-1] == "unknown":
            continue
        if frame_emotions[i] != frame_emotions[i-1]:
            changes += 1
    
    stability = round(100 - (changes / total_valid * 100), 2)

    # 5. Stress Timeline (Fear, Sad, Angry)
    stress_emotions = {"fear", "sad", "angry", "disgust"}
    stress_moments = []
    start = None

    for i, emo in enumerate(frame_emotions):
        if emo in stress_emotions:
            if start is None: start = i
        elif emo != "unknown":
            if start is not None:
                stress_moments.append((start, i - 1))
                start = None

    # 6. Confidence Score
    confidence = round(global_percentages.get("neutral", 0) + global_percentages.get("happy", 0), 2)

    return {
        "dominant_emotion": dominant,
        "global_percentages": global_percentages,
        "emotion_percentages": timeline_data,  # 🔥 This is what the chart uses
        "emotional_stability": max(0, stability),
        "confidence_score": min(100, confidence),
        "stress_timeline": [
            {"start": str(timedelta(seconds=s//fps)), "end": str(timedelta(seconds=e//fps))}
            for s, e in stress_moments
        ]
    }