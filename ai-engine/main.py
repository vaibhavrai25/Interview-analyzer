import os
from uuid import uuid4
from fastapi import FastAPI, UploadFile, File, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import whisper

# Your custom modules
from database import (
    save_interview, 
    delete_interview, 
    update_interview, 
    get_all_interviews
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

# 🔥 UPDATED: Added is_pinned so the API recognizes it
class InterviewUpdate(BaseModel):
    title: str = None
    notes: str = None
    is_pinned: bool = None

# --- ROUTES ---

@app.get("/")
def home():
    return {"message": "AI Engine is running"}

@app.post("/analyze-video")
async def analyze_video_route(background_tasks: BackgroundTasks, video: UploadFile = File(...)):
    unique_name = f"{uuid4()}_{video.filename}"
    video_location = os.path.join("videos", unique_name)

    with open(video_location, "wb") as buffer:
        buffer.write(await video.read())

    def run_pipeline(path):
        report = process_video(path)
        save_interview(path, report)

    background_tasks.add_task(run_pipeline, video_location)
    return {"message": "Processing started", "video_url": video_location}

@app.get("/interviews")
def fetch_interviews():
    interviews = []
    # get_all_interviews now handles the sorted list from database.py
    for item in get_all_interviews(): 
        item["_id"] = str(item["_id"])
        interviews.append(item)
    return {"data": interviews}

# 🔥 NEW: The PUT route to handle Pinning and Renaming
@app.put("/interview/{interview_id}")
async def edit_interview(interview_id: str, payload: InterviewUpdate):
    # Convert Pydantic model to dict and remove fields that weren't sent (None)
    update_data = {k: v for k, v in payload.dict().items() if v is not None}
    
    if not update_data:
        raise HTTPException(status_code=400, detail="No data provided to update")

    success = update_interview(interview_id, update_data)
    
    if not success:
        raise HTTPException(status_code=404, detail="Interview not found")
        
    return {"message": "Updated successfully", "updated_fields": list(update_data.keys())}

@app.delete("/interview/{interview_id}")
def remove_interview(interview_id: str):
    success = delete_interview(interview_id)
    if not success:
        raise HTTPException(status_code=404, detail="Not found")
    return {"message": "Deleted successfully"}