import os
import shutil
import cv2
import time
import json
import cloudinary.uploader

from moviepy.editor import VideoFileClip

from audio_extractor import extract_audio_from_video
from frame_extractor import extract_frames_from_video
from emotion_analyzer import analyze_emotions_from_frames
from speech_to_text import transcribe_audio
from emotion_summary import summarize_emotions
from qa_extractor import extract_qa_pairs
from analyzer import analyze_text, analyze_code
from database import update_interview_status, get_interview_by_id


def normalize_transcript_to_text(transcript):
    if transcript is None:
        return ""

    if isinstance(transcript, str):
        return transcript.strip()

    if isinstance(transcript, list):
        parts = []

        for item in transcript:
            if isinstance(item, str):
                if item.strip():
                    parts.append(item.strip())

            elif isinstance(item, dict):
                role = item.get("role", "")
                text = item.get("text", "") or item.get("content", "")

                if text and isinstance(text, str):
                    if role:
                        parts.append(f"{role}: {text.strip()}")
                    else:
                        parts.append(text.strip())

        return " ".join(parts).strip()

    if isinstance(transcript, dict):
        if isinstance(transcript.get("text"), str):
            return transcript.get("text", "").strip()

        if isinstance(transcript.get("transcript"), str):
            return transcript.get("transcript", "").strip()

        try:
            return json.dumps(transcript)
        except Exception:
            return str(transcript)

    return str(transcript).strip()


def build_live_qa_analysis(live_questions, live_answers):
    qa_analysis = []

    if not isinstance(live_questions, list):
        live_questions = []

    if not isinstance(live_answers, list):
        live_answers = []

    limit = min(len(live_questions), len(live_answers))

    for i in range(limit):
        q = live_questions[i]
        a = live_answers[i]

        question_text = ""
        answer_text = ""

        if isinstance(q, dict):
            question_text = q.get("text", "") or q.get("content", "")
        elif isinstance(q, str):
            question_text = q

        if isinstance(a, dict):
            answer_text = a.get("text", "") or a.get("content", "")
        elif isinstance(a, str):
            answer_text = a

        if answer_text and answer_text.strip():
            qa_analysis.append(
                {
                    "question": question_text or "Live interviewer question",
                    "answer": answer_text,
                    "analysis": analyze_text(answer_text),
                }
            )

    return qa_analysis


def upload_to_cloudinary(file_path, public_id):
    if not all(
        [
            os.getenv("CLOUDINARY_CLOUD_NAME"),
            os.getenv("CLOUDINARY_API_KEY"),
            os.getenv("CLOUDINARY_API_SECRET"),
        ]
    ):
        print(" Cloudinary env missing. Skipping upload.")
        return None

    compressed_path = f"{file_path}_compressed.mp4"
    clip = None

    try:
        print(f"🗜️ Compressing Video: {public_id}")

        clip = VideoFileClip(file_path)
        clip.write_videofile(
            compressed_path,
            bitrate="1000k",
            audio_codec="aac",
            verbose=False,
            logger=None,
        )

        print(f" Uploading to Cloudinary: {public_id}")

        response = cloudinary.uploader.upload_large(
            compressed_path,
            resource_type="video",
            public_id=public_id,
            folder="interview_videos",
            chunk_size=6000000,
        )

        return response.get("secure_url")

    except Exception as e:
        print(f" Cloudinary upload failed: {e}")
        return None

    finally:
        try:
            if clip:
                clip.close()
        except Exception:
            pass

        if os.path.exists(compressed_path):
            try:
                os.remove(compressed_path)
            except Exception:
                pass


def get_video_metadata(video_path):
    cap = None

    try:
        for attempt in range(3):
            cap = cv2.VideoCapture(video_path)

            if cap.isOpened():
                break

            print(f" VideoCapture busy, retrying ({attempt + 1}/3)...")
            time.sleep(1.5)

        if not cap or not cap.isOpened():
            raise Exception(f"Could not open video file: {video_path}")

        fps = cap.get(cv2.CAP_PROP_FPS) or 0
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)

        duration_seconds = frame_count / fps if fps > 0 else 0

        if duration_seconds <= 0:
            try:
                clip = VideoFileClip(video_path)
                duration_seconds = float(clip.duration or 0)
                clip.close()
            except Exception:
                duration_seconds = 0

        duration_str = f"{int(duration_seconds // 60)}:{int(duration_seconds % 60):02d}"

        thumb_path = video_path.rsplit(".", 1)[0] + "_thumb.jpg"

        ret, frame = cap.read()
        if ret:
            cv2.imwrite(thumb_path, frame)

        return duration_seconds, duration_str, thumb_path

    finally:
        if cap:
            cap.release()


def process_video(video_path, interview_id):
    audio_path = None
    frames_folder = None
    thumb_path = None
    cloudinary_url = None

    try:
        if not os.path.exists(video_path):
            print(f" Video file missing: {video_path}")
            return None

        duration_seconds, duration_str, thumb_path = get_video_metadata(video_path)

        update_interview_status(
            interview_id,
            "Syncing Neural Data...",
            duration=duration_str,
        )

        interview_data = get_interview_by_id(interview_id) or {}

        existing_transcript = interview_data.get("transcript", "")

        if existing_transcript:
            full_text = normalize_transcript_to_text(existing_transcript)
        else:
            update_interview_status(interview_id, "Transcribing Neural Feed...")

            audio_path = extract_audio_from_video(video_path)

            if audio_path:
                transcript_segments = transcribe_audio(audio_path)
                full_text = normalize_transcript_to_text(transcript_segments)
            else:
                full_text = ""

        update_interview_status(interview_id, "Analyzing Answers...")

        qa_analysis = []

        live_questions = interview_data.get("ai_questions", [])
        live_answers = interview_data.get("user_answers", [])

        if live_questions and live_answers:
            qa_analysis = build_live_qa_analysis(live_questions, live_answers)

        if not qa_analysis:
            safe_text = normalize_transcript_to_text(full_text)

            if safe_text:
                pairs = extract_qa_pairs(safe_text)

                qa_analysis = [
                    {
                        "question": pair.get("question", "Interview Question"),
                        "answer": pair.get("answer", ""),
                        "analysis": analyze_text(pair.get("answer", "")),
                    }
                    for pair in pairs
                    if pair.get("answer", "").strip()
                ]

        if not qa_analysis:
            qa_analysis = [
                {
                    "question": "General Interview Context",
                    "answer": full_text or "No clear verbal answer detected.",
                    "analysis": analyze_text(full_text or ""),
                }
            ]

        update_interview_status(interview_id, "Auditing Facial Confidence...")

        try:
            frames_folder = extract_frames_from_video(video_path)
            raw_emotions = analyze_emotions_from_frames(frames_folder)
            emotion_report = summarize_emotions(raw_emotions, fps=1)
        except Exception as e:
            print(f" Emotion analysis failed: {e}")
            emotion_report = {
                "error": "Emotion analysis unavailable",
                "dominant_emotion": "unknown",
                "global_percentages": {},
                "emotion_percentages": {},
                "emotional_stability": 0,
                "confidence_score": 0,
                "stress_timeline": [],
            }

        code_review = interview_data.get("code_analysis", "") or ""

        code_snapshot = (
            interview_data.get("code_snapshot")
            or interview_data.get("latest_code_snapshot")
            or ""
        )

        if code_snapshot and len(code_snapshot.strip()) > 30:
            update_interview_status(interview_id, "Auditing Code Logic...")

            try:
                code_review = analyze_code(code_snapshot)
            except Exception as e:
                print(f" Code analysis failed: {e}")
                code_review = "Code analysis unavailable."

        update_interview_status(interview_id, "Compressing & Uploading...")

        cloudinary_url = upload_to_cloudinary(video_path, interview_id)
        final_video_path = cloudinary_url if cloudinary_url else video_path

        return {
            "duration": duration_str,
            "interview_duration": duration_str,
            "transcript": full_text,
            "qa_analysis": qa_analysis,
            "analysis": qa_analysis,
            "emotion_analysis": emotion_report,
            "emotions": emotion_report,
            "code_snapshot": code_snapshot,
            "code_analysis": code_review,
            "video_path": final_video_path,
            "thumbnail_path": thumb_path,
            "status": "Completed",
        }

    except Exception as e:
        print(f" PIPELINE CRASH: {e}")
        update_interview_status(interview_id, f"Error in Analysis: {str(e)[:100]}")
        return None

    finally:
        if audio_path and os.path.exists(audio_path):
            try:
                os.remove(audio_path)
            except Exception:
                pass

        if frames_folder and os.path.exists(frames_folder):
            shutil.rmtree(frames_folder, ignore_errors=True)

        if cloudinary_url:
            if os.path.exists(video_path):
                try:
                    os.remove(video_path)
                except Exception:
                    pass

            if thumb_path and os.path.exists(thumb_path):
                try:
                    os.remove(thumb_path)
                except Exception:
                    pass