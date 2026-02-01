import os
from audio_extractor import extract_audio_from_video
from frame_extractor import extract_frames_from_video
from emotion_analyzer import analyze_emotions_from_frames
from analyzer import analyze_text
from speech_to_text import transcribe_audio
from emotion_summary import summarize_emotions



def process_video(video_path):

    # 1️⃣ Extract audio
    audio_path = extract_audio_from_video(video_path)

    # 2️⃣ Speech to text
    transcript = transcribe_audio(audio_path)

    # 3️⃣ Text analysis
    text_analysis = analyze_text(transcript)

    # 4️⃣ Extract frames
    frames_folder = extract_frames_from_video(video_path)

    # 5️⃣ Emotion analysis
    emotions= analyze_emotions_from_frames(frames_folder)
    emotion_report = summarize_emotions(emotions, fps=1)


    # 6️⃣ Combine
    final_report = {
        "transcript": transcript,
        "text_analysis": text_analysis,
        "emotion_analysis": emotion_report
    }

    return final_report
