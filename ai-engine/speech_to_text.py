import whisper
import torch
import os

# Check if NVIDIA GPU is available
device = "cuda" if torch.cuda.is_available() else "cpu"

# Load model onto the specific device once during server startup
print(f"Loading Whisper model on {device}...")
model = whisper.load_model("base", device=device)

def transcribe_audio(audio_path: str):
    """
    Takes audio file path and returns a list of timestamped segments
    for real-time dashboard synchronization and click-to-seek.
    """
    if not os.path.exists(audio_path):
        return []

    try:
        # fp16=False is necessary if you are running on a CPU
        # We use transcribe to get the full result dictionary including 'segments'
        result = model.transcribe(audio_path, fp16=(device == "cuda"))
        
        # 🔥 Extract segments with timestamps for interactive UI
        segments = []
        for segment in result.get("segments", []):
            segments.append({
                "start": round(segment["start"], 2),
                "end": round(segment["end"], 2),
                "text": segment["text"].strip()
            })
            
        return segments
    except Exception as e:
        print(f"❌ Whisper Error: {e}")
        return []