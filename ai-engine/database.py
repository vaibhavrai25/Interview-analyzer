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

def save_interview(video_path: str, report: dict):
    """Saves a new analysis report with default management fields."""
    if report is None:
        print("❌ Cannot save: Report is None")
        return None

    document = {
        "interview_id": str(uuid.uuid4()),
        "title": "Untitled Interview",
        "video_path": video_path,
        "is_pinned": False,  # Default state for new uploads
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

def update_interview(interview_id: str, data: dict):
    """
    Handles dynamic updates for title, notes, or pinning.
    Search is performed via the custom interview_id string.
    """
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
        # Note: In a production app, you should also delete 
        # the physical video file using os.remove() here.
        result = reports_collection.delete_one({"interview_id": interview_id})
        return result.deleted_count > 0
    except Exception as e:
        print(f"❌ Delete Error: {e}")
        return False

def get_all_interviews():
    """
    Fetches all interviews.
    Priority 1: Pinned items (is_pinned: True)
    Priority 2: Recency (created_at: Newest first)
    """
    interviews = []
    # Using a compound sort to keep pinned items at the top
    cursor = reports_collection.find().sort([
        ("is_pinned", DESCENDING), 
        ("created_at", DESCENDING)
    ])
    
    for item in cursor:
        item["_id"] = str(item["_id"])
        interviews.append(item)
    return interviews