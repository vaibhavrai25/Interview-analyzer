def generate_report(transcript: str, analysis: dict) -> dict:
    """
    Formats analyzer output into a professional report structure
    """
    return {
        "transcript": transcript,
        "scores": {
            "communication": analysis["communication_score"],
            "confidence": analysis["confidence_score"],
            "technical_depth": analysis["technical_depth_score"],
            "final_interview": analysis["final_interview_score"],
        },
        "problems_detected": analysis["problems_detected"],
        "suggestions": analysis["suggestions"],
    }
