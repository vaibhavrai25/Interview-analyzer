import cv2
import os

def extract_frames_from_video(video_path):
    frames_folder = "frames"
    os.makedirs(frames_folder, exist_ok=True)

    cap = cv2.VideoCapture(video_path)
    count = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        if count % 30 == 0:  # 1 frame per second approx
            cv2.imwrite(f"{frames_folder}/frame_{count}.jpg", frame)

        count += 1

    cap.release()
    return frames_folder
