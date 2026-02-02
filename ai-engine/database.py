import os
from pymongo import MongoClient
from dotenv import load_dotenv
from datetime import datetime

load_dotenv()

MONGO_URL = os.getenv("MONGO_URL")
print("🔥 MONGO_URL FROM ENV:", MONGO_URL)

client = MongoClient(MONGO_URL)

print("🔥 DATABASES:", client.list_database_names())

db = client["interview_analyzer"]
print("🔥 USING DB:", db.name)

reports_collection = db["reports"]
print("🔥 COLLECTION:", reports_collection.name)


import uuid

def save_interview(video_path: str, report: dict):
    document = {
    "interview_id": str(uuid.uuid4()),
    "video_path": video_path,
    "report": report,          # 🔥 store FULL report
    "name": "",                # for future
    "notes": "",               # for future
    "created_at": datetime.utcnow()
}
    reports_collection.insert_one(document)





def get_all_interviews():
    interviews = list(reports_collection.find({}, {"_id": 0}))
    return interviews
