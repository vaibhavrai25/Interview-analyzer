def generate_report(transcript: str, analysis: dict, emotion_report: dict = None) -> dict:
    """
    Formats analyzer output into a professional report structure.
    Handles missing keys gracefully to prevent API crashes.
    """
    # Use .get() to provide default values (0 for scores, empty lists for text)
    report = {
        "transcript": transcript or "No transcript available",
        "scores": {
            "communication": analysis.get("communication_score", 0),
            "confidence": analysis.get("confidence_score", 0),
            "technical_depth": analysis.get("technical_depth_score", 0),
            "final_interview": analysis.get("final_interview_score", 0),
        },
        "problems_detected": analysis.get("problems_detected", []),
        "suggestions": analysis.get("suggestions", []),
    }

    # Add emotion data if it exists
    if emotion_report:
        report["emotions"] = {
            "dominant": emotion_report.get("dominant_emotion"),
            "stability": emotion_report.get("emotional_stability", 0),
            "stress_timeline": emotion_report.get("stress_timeline", []),
            "percentages": emotion_report.get("emotion_percentages", {})
        }
    
    return report