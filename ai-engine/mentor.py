import os
from groq import Groq
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv
from database import reports_collection

load_dotenv()
client = Groq(api_key=os.getenv("GROQ_API_KEY"))
router = APIRouter()

class ChatRequest(BaseModel):
    interview_id: str
    query: str
    timestamp: float

def _get_enhanced_context(report) -> str:
    transcript = report.get("transcript", "")
    code = report.get("code_snapshot", "No code recorded.")
    audit = report.get("code_analysis", "No technical audit available yet.")
    resume = report.get("resume_context", "No resume provided.")
    
    chat_history = report.get("mentor_chat_history", [])
    history_str = "\n".join([f"{m['role'].upper()}: {m['content']}" for m in chat_history[-6:]])

    context = f"""
    CANDIDATE RESUME: {resume[:1000]}
    
    SESSION PERFORMANCE:
    - Transcript: {transcript[:1000]}
    - Code Snippet: {code}
    - Technical Audit: {audit}

    RECENT CONVERSATION HISTORY:
    {history_str}
    """
    return context

async def _get_real_ai_response(context, query, scores, interview_id):
    sys_instruct = f"""
    You are 'Jarvis', a world-class Technical Career Mentor. Goal: help candidate improve. Interview Score: {scores.get('final')}/100.
    STYLE: Use Markdown. Connect advice to projects in resume. End with a follow-up question.
    """
    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": sys_instruct},
                {"role": "user", "content": f"CONTEXT: {context}\n\nQUERY: {query}"}
            ],
            temperature=0.7
        )
        answer = response.choices[0].message.content
        
        reports_collection.update_one(
            {"interview_id": interview_id},
            {"$push": {"mentor_chat_history": {"role": "user", "content": query}}}
        )
        reports_collection.update_one(
            {"interview_id": interview_id},
            {"$push": {"mentor_chat_history": {"role": "assistant", "content": answer}}}
        )
        return answer
    except Exception as e:
        print(f"❌ Groq Mentor Error: {e}")
        return "Neural link temporarily unstable. Please try again."

@router.post("/mentor/chat")
async def mentor_chat(req: ChatRequest):
    # 🔥 FIXED: Changed find_findOne to find_one
    report = reports_collection.find_one({"interview_id": req.interview_id})
    if not report:
        raise HTTPException(status_code=404, detail="Session not found")

    context = _get_enhanced_context(report)
    analysis_list = report.get("analysis", [])
    final_score = report.get("final_interview_score", 0)
    
    if analysis_list and isinstance(analysis_list[0], dict):
        node = analysis_list[0].get("analysis", {})
        final_score = node.get("final_interview_score", final_score)
    
    scores = {"final": final_score}
    ai_answer = await _get_real_ai_response(context, req.query, scores, req.interview_id)
    return {"answer": ai_answer}