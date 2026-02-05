import cv2
import os
from uuid import uuid4

def extract_frames_from_video(video_path):
    # 1. Generate a unique folder name to prevent Windows Access Errors
    unique_id = str(uuid4())[:8]
    frames_folder = f"temp_frames_{unique_id}"
    os.makedirs(frames_folder, exist_ok=True)

    cap = cv2.VideoCapture(video_path)
    
    if not cap.isOpened():
        print(f"❌ Error: Could not open video {video_path}")
        return frames_folder

    # 2. Get the ACTUAL Frame Rate of the video
    video_fps = cap.get(cv2.CAP_PROP_FPS)
    if video_fps <= 0:
        video_fps = 30  # Fallback to 30 if metadata is missing
    
    # Calculate how many frames to skip to get exactly 1 frame per second
    interval = int(video_fps)

    count = 0
    saved_count = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        # 3. Save exactly one frame for every second of video
        if count % interval == 0:
            # We use leading zeros (e.g., 0001.jpg) so os.listdir sorts them correctly later
            frame_name = os.path.join(frames_folder, f"frame_{saved_count:04d}.jpg")
            cv2.imwrite(frame_name, frame)
            saved_count += 1

        count += 1

    # 4. CRITICAL: Release the file lock so Windows can delete the folder later
    cap.release()
    print(f"✅ Extracted {saved_count} frames to {frames_folder}")
    
    return frames_folder