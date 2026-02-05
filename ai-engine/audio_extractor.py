import os
from moviepy.editor import VideoFileClip

def extract_audio_from_video(video_path):
    # 🔥 FIX: Create a unique name based on the video path 
    # This prevents User A from overwriting User B's audio
    base_name = os.path.splitext(video_path)[0]
    audio_path = f"{base_name}.wav"
    
    try:
        video = VideoFileClip(video_path)
        # fps=16000 is the standard for Whisper AI (saves processing time)
        video.audio.write_audiofile(audio_path, codec='pcm_s16le', fps=16000, verbose=False, logger=None)
        
        # 🔥 FIX: Close the reader to unlock the file
        video.close()
        
        return audio_path
    except Exception as e:
        print(f"❌ Error extracting audio: {e}")
        return None