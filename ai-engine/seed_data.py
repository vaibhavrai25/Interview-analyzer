import os
import uuid
from datetime import datetime, timedelta, timezone
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

# --- 1. SETUP ---
MONGO_URL = os.getenv("MONGO_URL")
client = MongoClient(MONGO_URL)
db = client["interview_analyzer"]
reports_collection = db["reports"]

def generate_mock_data():
    print(" Initializing Neural Data Injection...")
    
    # Clear existing mock data if you want a clean slate (Optional)
    # reports_collection.delete_many({"is_mock": True})

    roles = ["Frontend Developer", "Backend Engineer", "Full Stack Developer", "Data Scientist", "DevOps Engineer"]
    companies = ["Google", "Amazon", "Oracle", "Microsoft", "Zomato"]
    tech_stacks = ["React, Node, MongoDB", "Python, FastAPI, PostgreSQL", "Java, Spring Boot", "Next.js, Tailwind, AWS", "C++, System Design"]

    mock_interviews = []

    for i in range(5):
        interview_id = str(uuid.uuid4())
        # Stagger dates over the last 10 days to see the trend line
        created_at = datetime.now(timezone.utc) - timedelta(days=(10 - i*2))
        
        # Varied scores to show improvement/variance
        tech_score = 6 + (i * 8)
        conf_score = 5 + (i * 11)
        comm_score = 7 + (i * 5)
        final_score = round((tech_score + conf_score + comm_score) / 3, 1)

        doc = {
            "interview_id": interview_id,
            "title": f"{companies[i]} Mock - {roles[i]}",
            "interview_type": "Technical",
            "video_path": "videos/sample.mp4", # Placeholder
            "is_pinned": True if i == 4 else False, # Pin the most recent one
            "status": "Completed",
            "duration": f"{10 + i}:2{i}",
            "is_mock": True, # Tag to identify generated data
            "transcript": [
                {"start": 0, "end": 5, "text": "Hello, I am excited to interview for the role."},
                {"start": 10, "end": 20, "text": f"I have extensive experience in {tech_stacks[i]}."},
                {"start": 25, "end": 40, "text": "I solved a complex scaling issue using optimized algorithms."}
            ],
            "analysis": [
                {
                    "analysis": {
                        "communication_score": comm_score,
                        "confidence_score": conf_score,
                        "technical_depth_score": tech_score,
                        "final_interview_score": final_score,
                        "suggestions": [
                            "Improve eye contact with the camera.",
                            f"Focus more on the internal working of {tech_stacks[i].split(',')[0]}.",
                            "Try to use the STAR method for behavioral questions."
                        ]
                    }
                }
            ],
            "emotions": {"happy": 0.6, "neutral": 0.3, "anxious": 0.1},
            "created_at": created_at
        }
        mock_interviews.append(doc)

    try:
        reports_collection.insert_many(mock_interviews)
        print(f"✅ Successfully injected {len(mock_interviews)} mock interviews!")
        print("📈 Open your Dashboard to see the charts in action.")
    except Exception as e:
        print(f"❌ Injection Error: {e}")

if __name__ == "__main__":
    generate_mock_data()