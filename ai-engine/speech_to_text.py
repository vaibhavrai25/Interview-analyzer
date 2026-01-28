import whisper

# Load model only once (very important)
model = whisper.load_model("base")

def transcribe_audio(audio_path: str) -> str:
    """
    Takes audio file path and returns transcribed text using Whisper
    """
    result = model.transcribe(audio_path)
    return result["text"]
