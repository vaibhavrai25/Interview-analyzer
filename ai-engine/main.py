import multiprocessing
multiprocessing.freeze_support()


from fastapi import FastAPI, UploadFile, File
import whisper
import tempfile
import os

app = FastAPI()

model = whisper.load_model("base")

@app.get("/")
def home():
    return {"message": "AI Engine is running"}

@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    # Save uploaded file temporarily
    with tempfile.NamedTemporaryFile(delete=False) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    # Transcribe audio
    result = model.transcribe(tmp_path)
    text = result["text"]

    os.remove(tmp_path)

    return {"transcript": text}
