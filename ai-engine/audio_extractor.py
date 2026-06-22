import os
import subprocess


def extract_audio_from_video(video_path):
    """
    Extracts 16kHz mono WAV audio from a video file for Whisper/STT.

    Uses ffmpeg directly instead of MoviePy to avoid noisy ffmpeg info logs and
    random "At least one output file must be specified" messages.
    """

    if not video_path or not os.path.exists(video_path):
        print(f" Video file not found for audio extraction: {video_path}")
        return None

    base_name = os.path.splitext(video_path)[0]
    audio_path = f"{base_name}.wav"

    command = [
        "ffmpeg",
        "-y",
        "-i",
        video_path,
        "-vn",
        "-acodec",
        "pcm_s16le",
        "-ar",
        "16000",
        "-ac",
        "1",
        audio_path,
    ]

    try:
        result = subprocess.run(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=False,
        )

        if result.returncode != 0:
            print(" FFmpeg audio extraction failed:")
            print(result.stderr[-1200:] if result.stderr else "No stderr")
            return None

        if not os.path.exists(audio_path) or os.path.getsize(audio_path) == 0:
            print(" Audio extraction produced empty file.")
            return None

        return audio_path

    except FileNotFoundError:
        print(" ffmpeg not found. Please install ffmpeg and add it to PATH.")
        return None

    except Exception as e:
        print(f" Error extracting audio: {e}")
        return None