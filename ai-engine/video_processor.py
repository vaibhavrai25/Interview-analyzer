import os
import shutil
import time
import cv2
from audio_extractor import extract_audio_from_video
from frame_extractor import extract_frames_from_video
from emotion_analyzer import analyze_emotions_from_frames
from speech_to_text import transcribe_audio
from emotion_summary import summarize_emotions
from qa_extractor import extract_qa_pairs
from analyzer import analyze_text

def process_video(video_path):
    audio_path = None
    frames_folder = None
    
    try:
        # Ensure the video actually exists
        if not os.path.exists(video_path):
            print(f"❌ Error: Video file not found at {video_path}")
            return None

        # 1. 🖼️ Generate Dashboard Thumbnail (PRO FIX)
        # Creating a .jpg so the dashboard loads instantly without video preloading
        thumb_path = video_path.rsplit(".", 1)[0] + "_thumb.jpg"
        cap = cv2.VideoCapture(video_path)
        ret, frame = cap.read()
        if ret:
            cv2.imwrite(thumb_path, frame)
        cap.release()

        # 2. 🎙️ Audio & Transcript
        audio_path = extract_audio_from_video(video_path)
        transcript = transcribe_audio(audio_path)

        # 3. ✍️ Q&A Extraction & Text Analysis
        qa_pairs = extract_qa_pairs(transcript)
        qa_analysis = []
        for qa in qa_pairs:
            analysis = analyze_text(qa["answer"])
            qa_analysis.append({
                "question": qa["question"],
                "answer": qa["answer"],
                "analysis": analysis
            })

        # 4. 🎭 Emotion Analysis
        frames_folder = extract_frames_from_video(video_path)
        raw_emotions = analyze_emotions_from_frames(frames_folder)
        emotion_report = summarize_emotions(raw_emotions, fps=1)

        # 5. 🚀 Final Output
        return {
            "transcript": transcript,
            "qa_analysis": qa_analysis,
            "emotion_analysis": emotion_report
        }

    except Exception as e:
        print(f"🔥 PIPELINE CRASHED: {e}")
        return None
    
    finally:
        # 🧹 ROBUST CLEANUP
        # We wrap this in a small delay to let Windows release file locks
        time.sleep(1) 
        
        if audio_path and os.path.exists(audio_path):
            try:
                os.remove(audio_path)
            except Exception as e:
                print(f"⚠️ Could not delete audio: {e}")

        if frames_folder and os.path.exists(frames_folder):
            try:
                shutil.rmtree(frames_folder)
            except Exception as e:
                # Often happens on Windows if a process is still closing
                print(f"⚠️ Could not delete frames folder: {e}")