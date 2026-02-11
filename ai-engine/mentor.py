from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from database import reports_collection

router = APIRouter()

class ChatRequest(BaseModel):
    interview_id: str
    query: str
    timestamp: float

@router.post("/mentor/chat")
async def mentor_chat(req: ChatRequest):
    # 1. Fetch the specific interview data
    report = reports_collection.find_one({"interview_id": req.interview_id})
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    # 2. Extract context around the timestamp (e.g., +/- 10 seconds)
    transcript = report.get("transcript", [])
    relevant_text = " ".join([
        seg["text"] for seg in transcript 
        if abs(seg["start"] - req.timestamp) < 15
    ])

    # 3. NexusMind Integration (Simulated Logic)
    # This is where Jarvis would query your knowledge graph for study resources
    resources = ["https://react.dev", "MNNIT DSA Roadmap"] 

    # 4. Generate AI Response (Using your LLM of choice)
    prompt = f"Context from 02:45: '{relevant_text}'. User asks: '{req.query}'"
    # ai_response = llm.generate(prompt)

    return {
        "answer": f"At {req.timestamp}s, you said '{relevant_text}'. To improve this, you should...",
        "resources": resources
    }