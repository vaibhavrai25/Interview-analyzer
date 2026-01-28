import os
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()




MONGO_URL = os.getenv("MONGO_URL")
print("MONGO URL:", MONGO_URL)

client = MongoClient(MONGO_URL)

db = client["interview_analyzer"]
reports_collection = db["reports"]

def save_report(report: dict):
    reports_collection.insert_one(report)

def get_all_reports():
    return list(reports_collection.find({}, {"_id": 0}))
