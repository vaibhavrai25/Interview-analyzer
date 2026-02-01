from video_processor import extract_audio_from_video, extract_frames

video_path = "test.mp4"

audio = extract_audio_from_video(video_path)
print("Audio extracted:", audio)

frames = extract_frames(video_path)
print("Frames saved in:", frames)
