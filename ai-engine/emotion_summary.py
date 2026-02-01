# emotion_summary.py
from collections import Counter
from datetime import timedelta

def summarize_emotions(frame_emotions, fps=1):
    """
    frame_emotions: list of emotions for each analyzed frame
    fps: how many frames per second you extracted (important for timeline)
    """

    total_frames = len(frame_emotions)

    if total_frames == 0:
        return {"error": "No emotions detected"}

    # ---------------------------------------------------
    # 1. Count each emotion
    # ---------------------------------------------------
    emotion_counts = Counter(frame_emotions)

    # Convert to percentage
    emotion_percentages = {
        emotion: round((count / total_frames) * 100, 2)
        for emotion, count in emotion_counts.items()
    }

    # ---------------------------------------------------
    # 2. Dominant emotion
    # ---------------------------------------------------
    dominant_emotion = emotion_counts.most_common(1)[0][0]

    # ---------------------------------------------------
    # 3. Emotional Stability (how often emotion changes)
    # ---------------------------------------------------
    changes = 0
    for i in range(1, total_frames):
        if frame_emotions[i] != frame_emotions[i - 1]:
            changes += 1

    stability_score = round(100 - (changes / total_frames) * 100, 2)

    # ---------------------------------------------------
    # 4. Stress detection (fear, sad, angry spikes)
    # ---------------------------------------------------
    stress_emotions = {"fear", "sad", "angry", "disgust"}
    stress_moments = []

    start = None
    for i, emo in enumerate(frame_emotions):
        if emo in stress_emotions:
            if start is None:
                start = i
        else:
            if start is not None:
                stress_moments.append((start, i - 1))
                start = None

    if start is not None:
        stress_moments.append((start, total_frames - 1))

    # Convert frame index → time
    stress_timeline = []
    for s, e in stress_moments:
        start_time = str(timedelta(seconds=s // fps))
        end_time = str(timedelta(seconds=e // fps))
        stress_timeline.append({"start": start_time, "end": end_time})

    # ---------------------------------------------------
    # 5. Confidence Score (happy + neutral = confident)
    # ---------------------------------------------------
    confidence_score = round(
        emotion_percentages.get("happy", 0)
        + emotion_percentages.get("neutral", 0),
        2,
    )

    # ---------------------------------------------------
    return {
        "dominant_emotion": dominant_emotion,
        "emotion_percentages": emotion_percentages,
        "emotional_stability": stability_score,
        "confidence_score": confidence_score,
        "stress_timeline": stress_timeline,
    }
