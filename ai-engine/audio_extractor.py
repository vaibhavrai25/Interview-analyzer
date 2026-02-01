from moviepy.editor import VideoFileClip

def extract_audio_from_video(video_path):
    audio_path = "temp_audio.wav"
    video = VideoFileClip(video_path)
    video.audio.write_audiofile(audio_path)
    return audio_path
