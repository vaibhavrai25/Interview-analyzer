import whisper
import torch
import os

# Check if NVIDIA GPU is available
device = "cuda" if torch.cuda.is_available() else "cpu"

# Load model onto the specific device
print(f"Loading Whisper model on {device}...")
model = whisper.load_model("base", device=device)

def transcribe_audio(audio_path: str) -> str:
    """
    Takes audio file path and returns transcribed text.
    """
    if not os.path.exists(audio_path):
        return ""

    try:
        # fp16=False is necessary if you are running on a CPU
        result = model.transcribe(audio_path, fp16=(device == "cuda"))
        
        # .strip() removes leading/trailing whitespace
        transcript = result.get("text", "").strip()
        
        return transcript
    except Exception as e:
        print(f"❌ Whisper Error: {e}")
        return ""