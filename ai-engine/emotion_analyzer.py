from fer.fer import FER
import cv2
import os
import re

# Initialize once to save memory
detector = FER(mtcnn=True) # mtcnn=True is slower but MUCH more accurate

def try_int(s):
    try:
        return int(s)
    except:
        return s

def natural_key(string_):
    """Helper to sort file names like frame_1, frame_2, frame_10 correctly."""
    return [try_int(c) for c in re.split('([0-9]+)', string_)]

def analyze_emotions_from_frames(frames_folder):
    emotions = []
    
    # 🔥 FIX: Sort frames numerically so the timeline is correct
    frame_names = os.listdir(frames_folder)
    frame_names.sort(key=natural_key)

    for frame_name in frame_names:
        frame_path = os.path.join(frames_folder, frame_name)
        img = cv2.imread(frame_path)

        if img is None:
            continue

        result = detector.detect_emotions(img)

        if result:
            # result[0] is the first face detected
            scores = result[0]["emotions"]
            dominant = max(scores, key=scores.get)
            emotions.append(dominant)
        else:
            # If no face is found, we record 'unknown' to keep the timeline consistent
            emotions.append("unknown")

    return emotions