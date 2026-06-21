import cv2
import os
from uuid import uuid4

def extract_frames_from_video(video_path):
    unique_id = str(uuid4())[:8]
    frames_folder = f"temp_frames_{unique_id}"
    os.makedirs(frames_folder, exist_ok=True)

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return frames_folder

    video_fps = cap.get(cv2.CAP_PROP_FPS) or 30
    # Capture 1 frame every 2 seconds (0.5 FPS)
    # interval = FPS * seconds_per_frame
    interval = int(video_fps * 2) 

    count = 0
    saved_count = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break
        if count % interval == 0:
            frame_name = os.path.join(frames_folder, f"frame_{saved_count:04d}.jpg")
            cv2.imwrite(frame_name, frame)
            saved_count += 1
        count += 1

    cap.release()
    return frames_folder