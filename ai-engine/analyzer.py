import os
import re
import json
from groq import Groq
from dotenv import load_dotenv

load_dotenv()
client = Groq(api_key=os.getenv("GROQ_API_KEY"))

def analyze_code(code):
    """Deep technical analysis of candidate code using Llama 3.3 70B"""
    if not code or len(code.strip()) < 10:
        return "No significant code submitted for analysis."
    
    prompt = f"""
    As a Principal Software Engineer at a FAANG company, provide a high-level technical audit of this interview code:
    
    CODE:
    {code}
    
    Your report must be in clean Markdown and cover:
    1. **Efficiency Analysis**: State the Big O Time and Space complexity. Is there a more optimal approach (e.g., swapping a nested loop for a hash map)?
    2. **Robustness & Edge Cases**: Does it handle null/empty inputs, large integers, or overflow?
    3. **Code Craftsmanship**: Evaluate naming conventions, modularity, and adherence to language-specific best practices.
    4. **Logical Soundness**: Are there any subtle bugs or logical fallacies?
    5. **Actionable Refactoring**: Provide 2-3 specific bullet points for improvement.
    
    Keep the tone professional, objective, and intellectually rigorous.
    """
    
    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2 # Lower temperature for factual technical accuracy
        )
        return response.choices[0].message.content
    except Exception as e:
        print(f"❌ Groq Code Analysis Error: {e}")
        return f"Code analysis unavailable: {str(e)}"

def analyze_text(text):
    """Neural scoring of interview answers for the Dashboard metrics"""
    if not text or not text.strip():
        return {
            "communication_score": 0, 
            "confidence_score": 0, 
            "technical_depth_score": 0, 
            "final_interview_score": 0,
            "problems_detected": ["Silence detected"],
            "suggestions": ["Try to provide detailed verbal explanations of your logic."]
        }

    prompt = f"""
    Act as a Senior Technical Recruiter. Analyze this transcript of a candidate's answer:
    "{text}"
    
    Provide a JSON object with the following strictly numerical scores (1-10) and feedback:
    1. 'comm': How clear and structured is the explanation?
    2. 'conf': Presence of filler words (um, like), tone certainty, and directness.
    3. 'tech': Usage of technical terminology and depth of concept explanation.
    4. 'problems': List specific issues (e.g., 'Frequent hedging', 'Weak conclusion').
    5. 'tips': List specific improvement steps.

    Return ONLY a valid JSON object in this format:
    {{"comm": 8, "conf": 7, "tech": 6, "problems": [], "tips": []}}
    """
    
    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1, # Extremely low temperature for consistent JSON output
            response_format={ "type": "json_object" }
        )
        
        res_data = json.loads(response.choices[0].message.content)
        
        # Mapping Groq JSON response to Dashboard schema
        comm = res_data.get("comm", 5)
        conf = res_data.get("conf", 5)
        tech = res_data.get("tech", 5)
        
        # Calculate weighted final score out of 100
        final_score = int(((comm * 0.3) + (conf * 0.2) + (tech * 0.5)) * 10)

        return {
            "communication_score": comm,
            "confidence_score": conf,
            "technical_depth_score": tech,
            "final_interview_score": final_score,
            "problems_detected": res_data.get("problems", []),
            "suggestions": res_data.get("tips", [])
        }
        
    except Exception as e:
        print(f"❌ Groq Text Analysis Error: {e}")
        # Robust fallback if AI fails
        return {
            "communication_score": 5,
            "confidence_score": 5,
            "technical_depth_score": 5,
            "final_interview_score": 50,
            "problems_detected": ["Analysis Engine Timeout"],
            "suggestions": ["Please check server logs."]
        }