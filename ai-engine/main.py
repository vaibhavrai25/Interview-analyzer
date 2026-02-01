import multiprocessing
multiprocessing.freeze_support()
from analyzer import analyze_text
from dotenv import load_dotenv
load_dotenv()
from database import get_all_interviews as get_all_reports
from database import save_interview  


import shutil
from analyzer import analyze_text
from speech_to_text import transcribe_audio
from report_generator import generate_report
from video_processor import process_video





from fastapi import FastAPI, UploadFile, File
import whisper
import tempfile
import os
from fastapi.middleware.cors import CORSMiddleware


app = FastAPI()
print("THIS MAIN IS RUNNING")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # NOT "*"
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


load_dotenv()



model = whisper.load_model("base")

@app.get("/")
def home():
    return {"message": "AI Engine is running"}

@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    # Save uploaded file temporarily
    with tempfile.NamedTemporaryFile(delete=False) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    # Transcribe audio
    result = model.transcribe(tmp_path)
    text = result["text"]

    os.remove(tmp_path)

    return {"transcript": text}

@app.post("/analyze")
async def analyze_transcript(data: dict):
    transcript = data.get("transcript")
    result = analyze_text(transcript)
    return result


@app.post("/analyze-audio")
async def analyze_audio(file: UploadFile = File(...)):
    try:
        import shutil, os, json

        temp_audio_path = f"temp_{file.filename}"

        with open(temp_audio_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        transcript = transcribe_audio(temp_audio_path)
        print("Transcript:", transcript)

        analysis = analyze_text(transcript)
        print("Analysis done")

        report = generate_report(transcript, analysis)
        print("Report generated")

        report = json.loads(json.dumps(report, default=str))
        save_interview(temp_audio_path, report)
        print("Saved to DB")

        os.remove(temp_audio_path)

        return report

    except Exception as e:
        print("🔥 ERROR:", e)
        return {"error": str(e)}


@app.get("/reports")
def fetch_reports():
    return get_all_reports()

@app.post("/analyze-video")
async def analyze_video(file: UploadFile = File(...)):

    temp_video_path = f"temp_{file.filename}"

    with open(temp_video_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # 🔥 Full video pipeline
    final_report = process_video(temp_video_path)

    os.remove(temp_video_path)

    return final_report