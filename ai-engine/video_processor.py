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
from database import update_interview_status

def process_video(video_path, interview_id):
    audio_path = None
    frames_folder = None
    
    try:
        if not os.path.exists(video_path):
            print(f"❌ Error: Video file not found at {video_path}")
            return None

        # 1. ⏱️ Calculate Duration & Generate Thumbnail
        cap = cv2.VideoCapture(video_path)
        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        duration_seconds = frame_count / fps if fps > 0 else 0
        duration_str = f"{int(duration_seconds // 60)}:{int(duration_seconds % 60):02d}"
        
        thumb_path = video_path.rsplit(".", 1)[0] + "_thumb.jpg"
        ret, frame = cap.read()
        if ret:
            cv2.imwrite(thumb_path, frame)
        cap.release()

        # Update initial metadata
        update_interview_status(interview_id, "Transcribing...", duration=duration_str)

        # 2. 🎙️ Audio & Timestamped Transcript
        audio_path = extract_audio_from_video(video_path)
        # 🔥 Now returns a list of segments: [{"start": 0.0, "end": 2.0, "text": "..."}, ...]
        transcript_segments = transcribe_audio(audio_path)
        
        # Create a full string version for Q&A extraction
        full_transcript_text = " ".join([seg["text"] for seg in transcript_segments])
        
        update_interview_status(interview_id, "Analyzing Q&A...")

        # 3. ✍️ Q&A Extraction & Text Analysis
        qa_pairs = extract_qa_pairs(full_transcript_text)
        qa_analysis = []
        for qa in qa_pairs:
            analysis = analyze_text(qa["answer"])
            qa_analysis.append({
                "question": qa["question"],
                "answer": qa["answer"],
                "analysis": analysis
            })

        update_interview_status(interview_id, "Analyzing Emotions...")

        # 4. 🎭 Emotion Analysis
        frames_folder = extract_frames_from_video(video_path)
        raw_emotions = analyze_emotions_from_frames(frames_folder)
        emotion_report = summarize_emotions(raw_emotions, fps=1)

        # 5. 🚀 Final Output
        return {
            "duration": duration_str,
            "transcript": transcript_segments, # 🔥 Saved as interactive segments
            "qa_analysis": qa_analysis,
            "emotion_analysis": emotion_report
        }

    except Exception as e:
        print(f"🔥 PIPELINE CRASHED: {e}")
        update_interview_status(interview_id, "Error in Analysis")
        return None
    
    finally:
        time.sleep(1) 
        if audio_path and os.path.exists(audio_path):
            try: os.remove(audio_path)
            except: pass
        if frames_folder and os.path.exists(frames_folder):
            try: shutil.rmtree(frames_folder)
            except: pass