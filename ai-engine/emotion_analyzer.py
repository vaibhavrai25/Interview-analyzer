import os
import re
import cv2

# Global reference for the Singleton
_detector = None

def get_detector():
    global _detector
    if _detector is None:
        try:
            from fer import FER
            # Lazy loading the model only when first needed
            _detector = FER(mtcnn=True)
        except Exception as e:
            print(f"⚠️ Emotion Engine Fallback: {e}")
            class FallbackFER:
                def detect_emotions(self, img): return []
            _detector = FallbackFER()
    return _detector

def analyze_emotions_from_frames(frames_folder):
    detector = get_detector()
    emotions = []
    
    if not os.path.exists(frames_folder):
        return []

    frame_names = sorted(os.listdir(frames_folder))

    for frame_name in frame_names:
        img = cv2.imread(os.path.join(frames_folder, frame_name))
        if img is None: continue
        
        try:
            result = detector.detect_emotions(img)
            emotions.append(max(result[0]["emotions"], key=result[0]["emotions"].get) if result else "unknown")
        except:
            emotions.append("unknown")
    return emotions