# emotion_analyzer.py

from fer.fer import FER
import cv2
import os

detector = FER()

def analyze_emotions_from_frames(frames_folder):
    emotions = []

    for frame_name in os.listdir(frames_folder):
        frame_path = os.path.join(frames_folder, frame_name)
        img = cv2.imread(frame_path)

        result = detector.detect_emotions(img)

        if result:
            dominant = max(result[0]["emotions"], key=result[0]["emotions"].get)
            emotions.append(dominant)

    return emotions
