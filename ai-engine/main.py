import os
from uuid import uuid4
from fastapi import FastAPI, UploadFile, File, BackgroundTasks, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import whisper

# Your custom modules
from database import (
    save_interview, 
    delete_interview, 
    update_interview, 
    get_all_interviews,
    update_interview_status,
    reports_collection # 🔥 Import collection for direct lookup
)
from video_processor import process_video

app = FastAPI()

# 1. Setup Static Files & CORS
if not os.path.exists("videos"):
    os.makedirs("videos")
app.mount("/videos", StaticFiles(directory="videos"), name="videos")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2. Load Model Once
model = whisper.load_model("base")

class InterviewUpdate(BaseModel):
    title: str = None
    notes: str = None
    is_pinned: bool = None

# --- ROUTES ---

@app.get("/")
def home():
    return {"message": "AI Engine is running"}

@app.post("/analyze-video")
async def analyze_video_route(
    background_tasks: BackgroundTasks, 
    video: UploadFile = File(...),
    title: str = Form(...),
    interview_type: str = Form(...)
):
    interview_id = str(uuid4()) 
    unique_name = f"{interview_id}_{video.filename}"
    video_location = os.path.join("videos", unique_name)

    with open(video_location, "wb") as buffer:
        buffer.write(await video.read())

    initial_report = {
        "status": "Transcribing...", 
        "duration": "Calculating...",
        "transcript": "",
        "qa_analysis": [],
        "emotion_analysis": {}
    }
    save_interview(video_location, initial_report, title=title, interview_type=interview_type, interview_id=interview_id)

    def run_pipeline(path, id):
        try:
            report = process_video(path, id) 
            update_interview(id, {
                **report,
                "status": "Completed"
            })
        except Exception as e:
            print(f"Pipeline Error: {e}")
            update_interview_status(id, "Error in Analysis")

    background_tasks.add_task(run_pipeline, video_location, interview_id)
    
    return {
        "message": "Processing started", 
        "interview_id": interview_id,
        "status": "Transcribing..."
    }

@app.get("/interviews")
def fetch_interviews():
    interviews = []
    for item in get_all_interviews(): 
        item["_id"] = str(item["_id"])
        interviews.append(item)
    return {"data": interviews}

# 🔥 NEW: Public Share / Single Interview Fetch Route
@app.get("/interview/{interview_id}")
async def fetch_single_interview(interview_id: str):
    """Fetches a single interview by its UUID for sharing or deep linking."""
    interview = reports_collection.find_one({"interview_id": interview_id})
    if not interview:
        raise HTTPException(status_code=404, detail="Interview report not found")
    
    # Convert MongoDB ObjectId to string for JSON compatibility
    interview["_id"] = str(interview["_id"])
    return {"data": interview}

@app.put("/interview/{interview_id}")
async def edit_interview(interview_id: str, payload: InterviewUpdate):
    update_data = {k: v for k, v in payload.dict().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No data provided to update")

    success = update_interview(interview_id, update_data)
    if not success:
        raise HTTPException(status_code=404, detail="Interview not found")
    return {"message": "Updated successfully"}

@app.delete("/interview/{interview_id}")
def remove_interview(interview_id: str):
    success = delete_interview(interview_id)
    if not success:
        raise HTTPException(status_code=404, detail="Not found")
    return {"message": "Deleted successfully"}