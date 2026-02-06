import os
import uuid
from datetime import datetime, timezone
from pymongo import MongoClient, DESCENDING
from dotenv import load_dotenv

load_dotenv()

# Setup Connection
MONGO_URL = os.getenv("MONGO_URL")
client = MongoClient(MONGO_URL)
db = client["interview_analyzer"]
reports_collection = db["reports"]

def save_interview(video_path: str, report: dict, title: str = "Untitled Interview", interview_type: str = "Technical", interview_id: str = None):
    """Saves a new analysis report with user-provided metadata and management fields."""
    if report is None:
        print("❌ Cannot save: Report is None")
        return None

    # 🔥 If interview_id is not provided (legacy support), generate one
    final_id = interview_id if interview_id else str(uuid.uuid4())

    document = {
        "interview_id": final_id,
        "title": title,
        "interview_type": interview_type,
        "video_path": video_path,
        "is_pinned": False,
        "status": report.get("status", "Completed"), # 🔥 Set initial status
        "duration": report.get("duration", "0:00"),    # 🔥 Set initial duration
        "transcript": report.get("transcript", ""),
        "analysis": report.get("qa_analysis", []), 
        "emotions": report.get("emotion_analysis", {}), 
        "created_at": datetime.now(timezone.utc)
    }
    
    try:
        result = reports_collection.insert_one(document)
        print(f"✅ Successfully saved to Mongo! ID: {result.inserted_id}")
        return document["interview_id"]
    except Exception as e:
        print(f"❌ Mongo Save Error: {e}")
        return None

def update_interview_status(interview_id: str, status: str, duration: str = None):
    """
    🔥 NEW: Specifically updates the processing status and duration.
    This allows the frontend Dashboard to show real-time step progress.
    """
    try:
        update_data = {"status": status}
        if duration:
            update_data["duration"] = duration
            
        reports_collection.update_one(
            {"interview_id": interview_id},
            {"$set": update_data}
        )
        print(f"🔄 Status Update: {status}")
    except Exception as e:
        print(f"❌ Status Update Error: {e}")

def update_interview(interview_id: str, data: dict):
    """Handles dynamic updates for full reports, titles, or pinning."""
    try:
        result = reports_collection.update_one(
            {"interview_id": interview_id},
            {"$set": data}
        )
        return result.modified_count > 0
    except Exception as e:
        print(f"❌ Update Error: {e}")
        return False

def delete_interview(interview_id: str):
    """Removes the record from the database."""
    try:
        result = reports_collection.delete_one({"interview_id": interview_id})
        return result.deleted_count > 0
    except Exception as e:
        print(f"❌ Delete Error: {e}")
        return False

def get_all_interviews():
    """Fetches all interviews sorted by pinning and recency."""
    interviews = []
    cursor = reports_collection.find().sort([
        ("is_pinned", DESCENDING), 
        ("created_at", DESCENDING)
    ])
    
    for item in cursor:
        item["_id"] = str(item["_id"])
        interviews.append(item)
    return interviews