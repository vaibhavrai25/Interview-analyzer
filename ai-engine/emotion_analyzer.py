import os
import cv2
import PIL.Image
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()
genai.configure(api_key=os.environ.get("GEMINI_API_KEY"))
vision_model = genai.GenerativeModel('gemini-3.6-flash')

def analyze_emotions_from_frames(frames_folder):
    if not os.path.exists(frames_folder):
        return []

    frame_names = sorted(os.listdir(frames_folder))
    if not frame_names:
        return []

    # Assuming frames were extracted at 1 frame per second (1 fps)
    # Take 1 frame every 5 seconds
    sample_interval = 5
    sampled_names = frame_names[::sample_interval]

    prompt_contents = [
        "Analyze the candidate's facial expressions in these sequential frames taken every 5 seconds from a video interview. "
        "For each image, provide exactly one dominant emotion from this list: angry, disgust, fear, happy, sad, surprise, neutral. "
        "Return a valid JSON array of strings in the exact order of the images. Example: [\"neutral\", \"happy\", \"neutral\"]"
    ]

    for frame_name in sampled_names:
        frame_path = os.path.join(frames_folder, frame_name)
        img = cv2.imread(frame_path)
        if img is not None:
            # Resize drastically to stay well under the 20MB inline payload limit
            # 256x256 is plenty of resolution for Gemini to detect facial expressions
            img_resized = cv2.resize(img, (256, 256))
            img_rgb = cv2.cvtColor(img_resized, cv2.COLOR_BGR2RGB)
            prompt_contents.append(PIL.Image.fromarray(img_rgb))

    if len(prompt_contents) == 1:
        return []

    try:
        # Send all 180+ frames in exactly 1 API call!
        response = vision_model.generate_content(
            prompt_contents,
            # Force the model to reply in structured JSON
            generation_config={"response_mime_type": "application/json"}
        )
        
        import json
        raw_emotions = json.loads(response.text.strip())
        
        valid_emotions = ["angry", "disgust", "fear", "happy", "sad", "surprise", "neutral"]
        emotions = []
        
        # Sanitize the JSON array
        for e in raw_emotions:
            clean_e = str(e).lower().strip()
            emotions.append(clean_e if clean_e in valid_emotions else "neutral")
            
        if not emotions:
            emotions = ["neutral"]
            
        # Interpolate the 5-second samples back across the 1-second timeline for your UI
        final_emotions = []
        for i in range(len(frame_names)):
            # Find which 5-second bucket this frame belongs to
            bucket_idx = min(i // sample_interval, len(emotions) - 1)
            final_emotions.append(emotions[bucket_idx])
                
        return final_emotions
        
    except Exception as e:
        print(f" Gemini Vision API Batch Error: {e}")
        return ["neutral"] * len(frame_names)