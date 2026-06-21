import os
from dotenv import load_dotenv
# 🔥 FIX: Import the new SDK correctly
from google import genai
from google.genai import types

load_dotenv()

# Initialize the modern Client
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

def analyze_code(code):
    """Analyze code for interview assessment using the 2026 Gemini SDK"""
    
    if not code or code.strip() == "// Start coding your solution here..." or code.strip() == "// Implement your solution...":
        return "No code submitted for analysis."
    
    prompt = f"""
    Analyze this code from a coding interview:
    {code}
    
    Provide a structured assessment:
    1. **Time Complexity**: What is the time complexity? Is it optimal?
    2. **Space Complexity**: What is the space complexity? Any optimizations possible?
    3. **Code Quality**: Readability, structure, best practices.
    4. **Problem-Solving Approach**: Logic, algorithm choice, edge cases.
    5. **Suggestions**: Specific improvements or alternative approaches.
    
    Keep the analysis concise, professional, and formatted for a report.
    """
    
    try:
        # 🔥 FIX: Use the new SDK syntax (models.generate_content)
        response = client.models.generate_content(
            model="gemini-1.5-flash", # Faster and cheaper for code analysis
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.4, # Lower temperature for factual technical analysis
            )
        )

        if response.text:
            return response.text
        return "Analysis completed but no text was generated."
        
    except Exception as e:
        print(f"❌ Code Analysis Error: {e}")
        return f"Code analysis failed: {str(e)}"