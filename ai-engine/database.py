import os
from pymongo import MongoClient
from datetime import datetime

MONGO_URL = os.getenv("MONGO_URL")
print("Mongo URL in DB file:", MONGO_URL)

assert MONGO_URL is not None, "MONGO_URL NOT FOUND. Dotenv not loaded."

client = MongoClient(MONGO_URL)

db = client["interview_analyzer"]
reports_collection = db["reports"]


def save_interview(video_path: str, report: dict):
    document = {
        "video_path": video_path,
        "report": report,
        "created_at": datetime.utcnow()
    }
    reports_collection.insert_one(document)


def get_all_interviews():
    return list(reports_collection.find({}, {"_id": 0}))
