import os
import time
import fitz
import json
import socketio
import cloudinary
import cloudinary.uploader
import subprocess

from uuid import uuid4
from datetime import datetime, timezone
from dotenv import load_dotenv

from fastapi import FastAPI, UploadFile, File, BackgroundTasks, HTTPException, Form, Query, Request, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, EmailStr

from database import (
    save_interview,
    delete_interview,
    update_interview,
    get_all_interviews,
    update_interview_status,
    reports_collection,
    users_collection,
    payments_collection,
    db,
)
from video_processor import process_video
from mentor import router as mentor_router
from realtime_session import router as realtime_router
from gemini_live_session import router as gemini_live_router
from simulation_logic import handle_code_update, handle_user_answer, cleanup_session
from models import UserRegister, UserLogin, hash_password, verify_password, create_access_token
from credit_utils import (
    serialize_wallet,
    can_start_interview,
    consume_credits,
    dev_topup,
    get_credit_settings,
)
from payment_utils import (
    CREDIT_PACKS,
    add_paid_credits_once,
    build_payment_document,
    create_razorpay_order,
    fetch_razorpay_order,
    fetch_razorpay_payment,
    get_pack,
    get_razorpay_key_id,
    normalize_payment_status,
    serialize_payment_doc,
    verify_checkout_signature,
    verify_webhook_signature,
)

try:
    from code_analyzer import analyze_code
except Exception:
    analyze_code = None

load_dotenv()

cloudinary.config(
    cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
    api_key=os.getenv("CLOUDINARY_API_KEY"),
    api_secret=os.getenv("CLOUDINARY_API_SECRET"),
    secure=True,
)

app = FastAPI(title="Jarvis Intelligence API")

DEFAULT_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

ENV_ORIGINS = [
    origin.strip()
    for origin in os.getenv("FRONTEND_ORIGINS", "").split(",")
    if origin.strip()
]

ALLOWED_ORIGINS = list(dict.fromkeys(DEFAULT_ORIGINS + ENV_ORIGINS))

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins=ALLOWED_ORIGINS,
    logger=False,
    engineio_logger=False,
)

if not os.path.exists("videos"):
    os.makedirs("videos")


class CreditCheckRequest(BaseModel):
    email: EmailStr
    duration_minutes: int = 15
    reason: str = "interview"
    interview_id: str | None = None
    engine: str = "gemini"


class CreditConsumeRequest(BaseModel):
    email: EmailStr
    duration_minutes: int = 15
    reason: str = "interview_start"
    interview_id: str | None = None
    engine: str = "gemini"


class DevTopupRequest(BaseModel):
    email: EmailStr
    credits: int = 999
    reason: str = "dev_topup"


class CreatePaymentOrderRequest(BaseModel):
    email: EmailStr
    pack_id: str


class VerifyPaymentRequest(BaseModel):
    email: EmailStr
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


def utc_now():
    return datetime.now(timezone.utc)


def safe_json_loads(value, fallback):
    try:
        if not value:
            return fallback
        if isinstance(value, (list, dict)):
            return value
        return json.loads(value)
    except Exception:
        return fallback


def fix_webm_duration(input_path: str, output_path: str):
    """
    Passes a raw browser WebM stream through FFmpeg without re-encoding to
    dynamically generate the missing duration metadata container needed by MoviePy.
    """
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-i", input_path, "-c", "copy", output_path],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True
        )
    except subprocess.CalledProcessError as e:
        error_msg = e.stderr.decode("utf-8") if e.stderr else str(e)
        print(f"FFmpeg failed to fix WebM structural metadata: {error_msg}")
        raise HTTPException(status_code=500, detail="Failed to sanitize video stream container.")


def build_basic_live_scores(transcript_items, code_snapshot):
    if not isinstance(transcript_items, list):
        transcript_items = []

    user_turns = [
        x for x in transcript_items
        if isinstance(x, dict) and x.get("role") == "user"
    ]

    total_user_words = sum(len((x.get("text") or "").split()) for x in user_turns)
    code_len = len((code_snapshot or "").strip())

    communication = min(10, max(4, total_user_words // 35 + 5))
    technical = min(10, max(4, code_len // 180 + len(user_turns)))
    confidence = min(10, max(5, len(user_turns) + 5))
    final_score = int((communication * 0.35 + technical * 0.45 + confidence * 0.20) * 10)

    return {
        "analysis": {
            "final_interview_score": final_score,
            "communication_score": communication,
            "confidence_score": confidence,
            "technical_depth_score": technical,
            "summary": "Preliminary live-session score. Deep video/audio analysis will update this after processing.",
            "strengths": [
                "Completed a live interview session",
                "Provided spoken responses",
                "Submitted current code editor snapshot",
            ],
            "improvements": [
                "Add more specific technical trade-offs",
                "Explain complexity and edge cases clearly",
            ],
        }
    }


@app.get("/")
async def root():
    return {
        "status": "online",
        "service": "Jarvis Intelligence API",
        "socket_path": "/socket.io/",
        "openai_realtime_path": "/realtime/session",
        "gemini_live_path": "/gemini/live/session",
        "credit_settings": get_credit_settings(),
        "payments": "enabled",
    }


@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    return Response(status_code=204)


@app.get("/health")
async def health_check():
    try:
        db.command("ping")
        mongo_status = "ok"
    except Exception as e:
        mongo_status = f"error: {str(e)[:120]}"

    return {
        "status": "ok",
        "mongo": mongo_status,
        "time": utc_now().isoformat(),
        "credit_settings": get_credit_settings(),
    }


@app.get("/health/gemini")
async def gemini_health_check():
    """Check if Gemini API is accessible and configured correctly."""
    import websockets
    import asyncio
    
    gemini_api_key = os.getenv("GEMINI_API_KEY", "").strip()
    gemini_model = os.getenv("GEMINI_LIVE_MODEL", "gemini-2.0-flash")
    
    if not gemini_api_key:
        return {
            "status": "error",
            "message": "GEMINI_API_KEY not set in .env",
            "model": gemini_model,
        }
    
    gemini_ws_url = (
        "wss://generativelanguage.googleapis.com/ws/"
        "google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent"
    )
    
    test_url = f"{gemini_ws_url}?key={gemini_api_key}"
    
    try:
        ws = await asyncio.wait_for(
            websockets.connect(test_url, ping_interval=None, ping_timeout=None),
            timeout=5
        )
        await ws.close()
        
        return {
            "status": "ok",
            "message": "Gemini API is reachable",
            "model": gemini_model,
            "api_key_prefix": gemini_api_key[:10] + "...",
        }
    except asyncio.TimeoutError:
        return {
            "status": "error",
            "message": "Gemini API connection timeout (5s). Check API key validity.",
            "model": gemini_model,
            "api_key_prefix": gemini_api_key[:10] + "...",
        }
    except Exception as e:
        return {
            "status": "error",
            "message": f"Gemini API error: {str(e)[:200]}",
            "model": gemini_model,
            "api_key_prefix": gemini_api_key[:10] + "...",
        }


@app.post("/auth/signup")
async def signup(user: UserRegister):
    existing_user = users_collection.find_one({"email": user.email})

    if existing_user:
        raise HTTPException(status_code=400, detail="Neural profile already exists with this email.")

    user_dict = user.model_dump() if hasattr(user, "model_dump") else user.dict()
    user_dict["password"] = hash_password(user.password)
    user_dict["created_at"] = utc_now()
    user_dict["credit_wallet"] = {
        "credits": 2,
        "used": 0,
        "total_purchased": 2,
        "expires_at": utc_now().replace(year=utc_now().year + 1),
        "updated_at": utc_now(),
    }
    user_dict["credit_ledger"] = [
        {
            "type": "credit",
            "credits": 2,
            "reason": "free_trial_signup",
            "created_at": utc_now(),
        }
    ]

    users_collection.insert_one(user_dict)

    return {
        "status": "success",
        "message": "Neural Link Authorized. 2 free trial credits added. Please log in.",
    }


@app.post("/auth/login")
async def login(user: UserLogin):
    db_user = users_collection.find_one({"email": user.email})

    if not db_user or not verify_password(user.password, db_user.get("password", "")):
        raise HTTPException(status_code=401, detail="Unauthorized access: Invalid credentials.")

    token = create_access_token({"sub": user.email})

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "name": db_user.get("name", ""),
            "email": db_user.get("email", ""),
        },
        "wallet": serialize_wallet(users_collection, user.email),
    }


@app.get("/credits/settings")
def credit_settings():
    return get_credit_settings()


@app.get("/credits/plans")
def credit_plans():
    return {
        "plans": [
            {
                "id": pack["id"],
                "label": pack["label"],
                "credits": pack["credits"],
                "minutes": pack["minutes"],
                "amount_rupees": pack["amount_rupees"],
                "price": pack["amount_rupees"],
                "currency": pack["currency"],
                "expires_days": pack["expires_days"],
            }
            for pack in CREDIT_PACKS.values()
        ]
    }


@app.get("/credits/balance")
def credit_balance(email: str = Query(...)):
    return {"wallet": serialize_wallet(users_collection, email)}


@app.get("/credits/wallet")
def credit_wallet(email: str = Query(...)):
    return {"wallet": serialize_wallet(users_collection, email)}


@app.post("/credits/check")
def credit_check(req: CreditCheckRequest):
    return can_start_interview(users_collection, req.email, req.duration_minutes)


@app.post("/credits/consume")
def credit_consume(req: CreditConsumeRequest):
    result = consume_credits(users_collection, req.email, req.duration_minutes, req.reason)
    if not result.get("deducted") and result.get("mode") != "dev_unlimited":
        raise HTTPException(status_code=402, detail=result.get("message", "Insufficient credits"))
    return result


@app.post("/credits/dev-topup")
def credit_dev_topup(req: DevTopupRequest):
    try:
        wallet = dev_topup(users_collection, req.email, req.credits, req.reason)
        return {"status": "success", "wallet": wallet}
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/credits/dev-grant")
def credit_dev_grant(req: DevTopupRequest):
    return credit_dev_topup(req)


@app.post("/payments/create-order")
async def payments_create_order(req: CreatePaymentOrderRequest):
    try:
        email = str(req.email).strip().lower()
        pack = get_pack(req.pack_id)

        order = await create_razorpay_order(email=email, pack_id=req.pack_id)
        doc = build_payment_document(email=email, pack=pack, order=order)

        payments_collection.update_one(
            {"razorpay_order_id": doc["razorpay_order_id"]},
            {"$setOnInsert": doc},
            upsert=True,
        )

        return {
            "status": "success",
            "key_id": get_razorpay_key_id(),
            "order_id": order.get("id"),
            "amount": pack["amount_paise"],
            "currency": pack["currency"],
            "name": "Jarvis Intelligence",
            "description": f"{pack['label']} - {pack['credits']} credits",
            "prefill": {
                "email": email,
            },
            "pack": pack,
        }

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"Create Payment Order Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/payments/verify")
async def payments_verify(req: VerifyPaymentRequest):
    try:
        email = str(req.email).strip().lower()

        payment_doc = payments_collection.find_one({
            "razorpay_order_id": req.razorpay_order_id,
            "email": email,
        })

        if not payment_doc:
            raise HTTPException(status_code=404, detail="Payment order not found.")

        if payment_doc.get("status") == "paid" and payment_doc.get("credits_added") is True:
            return {
                "status": "success",
                "message": "Payment already verified and credits already added.",
                "payment": serialize_payment_doc(payment_doc),
                "wallet": serialize_wallet(users_collection, email),
            }

        signature_ok = verify_checkout_signature(
            order_id=req.razorpay_order_id,
            payment_id=req.razorpay_payment_id,
            signature=req.razorpay_signature,
        )

        if not signature_ok:
            payments_collection.update_one(
                {"razorpay_order_id": req.razorpay_order_id},
                {
                    "$set": {
                        "status": "signature_failed",
                        "razorpay_payment_id": req.razorpay_payment_id,
                        "razorpay_signature": req.razorpay_signature,
                        "updated_at": utc_now(),
                    }
                },
            )
            raise HTTPException(status_code=400, detail="Payment signature verification failed.")

        payment_data = await fetch_razorpay_payment(req.razorpay_payment_id)
        order_data = await fetch_razorpay_order(req.razorpay_order_id)

        payment_status = normalize_payment_status(payment_data)

        if payment_status != "paid":
            payments_collection.update_one(
                {"razorpay_order_id": req.razorpay_order_id},
                {
                    "$set": {
                        "status": payment_status,
                        "razorpay_payment_id": req.razorpay_payment_id,
                        "razorpay_signature": req.razorpay_signature,
                        "raw_payment": payment_data,
                        "raw_verify": {
                            "payment": payment_data,
                            "order": order_data,
                        },
                        "updated_at": utc_now(),
                    }
                },
            )
            raise HTTPException(status_code=402, detail=f"Payment not captured yet. Status: {payment_status}")

        payments_collection.update_one(
            {"razorpay_order_id": req.razorpay_order_id},
            {
                "$set": {
                    "status": "paid",
                    "razorpay_payment_id": req.razorpay_payment_id,
                    "razorpay_signature": req.razorpay_signature,
                    "raw_payment": payment_data,
                    "raw_verify": {
                        "payment": payment_data,
                        "order": order_data,
                    },
                    "paid_at": utc_now(),
                    "updated_at": utc_now(),
                }
            },
        )

        latest_payment_doc = payments_collection.find_one({"razorpay_order_id": req.razorpay_order_id})
        credit_result = add_paid_credits_once(users_collection, payments_collection, latest_payment_doc)
        final_doc = payments_collection.find_one({"razorpay_order_id": req.razorpay_order_id})

        return {
            "status": "success",
            "message": credit_result.get("message", "Payment verified."),
            "credit_result": credit_result,
            "wallet": serialize_wallet(users_collection, email),
            "payment": serialize_payment_doc(final_doc),
        }

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"Verify Payment Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/payments/webhook/razorpay")
async def razorpay_webhook(request: Request, x_razorpay_signature: str = Header(None)):
    raw_body = await request.body()

    try:
        if not x_razorpay_signature:
            raise HTTPException(status_code=400, detail="Missing webhook signature.")

        if not verify_webhook_signature(raw_body, x_razorpay_signature):
            raise HTTPException(status_code=400, detail="Invalid webhook signature.")

        payload = json.loads(raw_body.decode("utf-8"))
        event = payload.get("event")
        entity = payload.get("payload", {}).get("payment", {}).get("entity", {}) or {}
        order_id = entity.get("order_id")
        payment_id = entity.get("id")

        if not order_id:
            return {"status": "ignored", "message": "No order_id in webhook."}

        payment_doc = payments_collection.find_one({"razorpay_order_id": order_id})

        if not payment_doc:
            return {"status": "ignored", "message": "Order not found in local database."}

        status = normalize_payment_status(entity)

        update_data = {
            "webhook_event": event,
            "raw_webhook": payload,
            "updated_at": utc_now(),
        }

        if payment_id:
            update_data["razorpay_payment_id"] = payment_id

        if status == "paid":
            update_data["status"] = "paid"
            update_data["paid_at"] = utc_now()
        elif status == "failed":
            update_data["status"] = "failed"
            update_data["failed_at"] = utc_now()
        else:
            update_data["status"] = status

        payments_collection.update_one(
            {"razorpay_order_id": order_id},
            {"$set": update_data},
        )

        if status == "paid":
            latest_payment_doc = payments_collection.find_one({"razorpay_order_id": order_id})
            credit_result = add_paid_credits_once(users_collection, payments_collection, latest_payment_doc)
            return {"status": "success", "credit_result": credit_result}

        return {"status": "success", "message": f"Webhook processed: {status}"}

    except HTTPException:
        raise
    except Exception as e:
        print(f"Razorpay Webhook Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/payments/history")
def payments_history(
    email: str = Query(...),
    status: str = Query("all"),
    limit: int = Query(100),
):
    try:
        query = {"email": str(email).strip().lower()}

        if status and status != "all":
            query["status"] = status

        cursor = payments_collection.find(query).sort("created_at", -1).limit(min(limit, 200))

        return {
            "status": "success",
            "data": [serialize_payment_doc(doc) for doc in cursor],
        }
    except Exception as e:
        print(f"Payment History Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/payments/history/{order_id}")
def payment_detail(order_id: str, email: str = Query(...)):
    doc = payments_collection.find_one({
        "razorpay_order_id": order_id,
        "email": str(email).strip().lower(),
    })

    if not doc:
        raise HTTPException(status_code=404, detail="Payment not found.")

    return {
        "status": "success",
        "payment": serialize_payment_doc(doc),
    }


@sio.event
async def connect(sid, environ, auth):
    config = auth.get("config") if isinstance(auth, dict) else {}
    config = config or {}

    print(f"Neural Link Established: {sid}")
    print(
        f"Socket Config: role={config.get('role')} "
        f"company={config.get('company')} "
        f"interview_id={config.get('interview_id')}"
    )

    await sio.emit(
        "connection_ack",
        {"status": "connected", "sid": sid, "message": "Neural Link established."},
        to=sid,
    )


@sio.on("code_update")
async def on_code(sid, data):
    await handle_code_update(sid, data, sio)


@sio.on("user_answer")
async def on_voice(sid, data):
    await handle_user_answer(sid, data, sio)


@sio.event
async def disconnect(sid):
    cleanup_session(sid)
    print(f"Neural Link Terminated: {sid}")


@app.post("/parse-resume")
async def parse_resume(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        if not contents:
            raise HTTPException(status_code=400, detail="Empty resume file uploaded.")

        doc = fitz.open(stream=contents, filetype="pdf")
        text = "".join(page.get_text() for page in doc)
        doc.close()

        if not text.strip():
            raise HTTPException(status_code=400, detail="Resume seems empty or scanned. OCR support is required.")

        resume_url = None
        if all([os.getenv("CLOUDINARY_CLOUD_NAME"), os.getenv("CLOUDINARY_API_KEY"), os.getenv("CLOUDINARY_API_SECRET")]):
            try:
                upload_result = cloudinary.uploader.upload(
                    contents,
                    resource_type="raw",
                    folder="resumes",
                    public_id=f"resume_{uuid4().hex}",
                )
                resume_url = upload_result.get("secure_url")
            except Exception as e:
                print(f"Resume Cloudinary upload skipped: {e}")

        return {"status": "success", "resume_context": text, "resume_url": resume_url}

    except HTTPException:
        raise
    except Exception as e:
        print(f"Resume Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def run_pipeline(path: str, interview_id: str):
    try:
        time.sleep(2)
        print(f"Starting Neural Pipeline for ID: {interview_id}")
        report = process_video(path, interview_id)
        if report:
            update_interview(interview_id, report)
            print(f"Pipeline Finished Successfully for ID: {interview_id}")
        else:
            update_interview_status(interview_id, "Error: Analysis Failed")
    except Exception as e:
        print(f"Pipeline Error: {e}")
        update_interview_status(interview_id, f"Error: {str(e)}")
    finally:
        # PRODUCTION REMOVAL BLUEPRINT: Ephemeral cleanup execution loop
        # Instantly completely sweeps video segments out of Render storage limits.
        if os.path.exists(path):
            try:
                os.remove(path)
                print(f"Render local ephemeral workspace video file cleaned up successfully: {path}")
            except Exception as e:
                print(f"Render local storage cleanup warning: {e}")


@app.post("/analyze-video")
async def analyze_video_route(
    background_tasks: BackgroundTasks,
    video: UploadFile = File(...),
    title: str = Form(...),
    interview_type: str = Form(...),
    user_email: str = Form(...),
):
    try:
        if not user_email:
            raise HTTPException(status_code=400, detail="User email is required.")

        duration_minutes = 15
        credit_result = consume_credits(users_collection, user_email, duration_minutes, "upload_analysis")
        if not credit_result.get("deducted") and credit_result.get("mode") != "dev_unlimited":
            raise HTTPException(status_code=402, detail=credit_result.get("message", "Insufficient credits"))

        interview_id = str(uuid4())
        video_location = os.path.join("videos", f"{interview_id}.mp4")
        contents = await video.read()

        if not contents:
            raise HTTPException(status_code=400, detail="Uploaded video is empty.")

        with open(video_location, "wb") as buffer:
            buffer.write(contents)
            buffer.flush()
            os.fsync(buffer.fileno())

        initial_report = {
            "status": "Processing...",
            "created_at": utc_now(),
            "session_type": "upload",
            "credit_result": credit_result,
        }

        save_interview(
            video_location,
            initial_report,
            title=title,
            interview_type=interview_type,
            interview_id=interview_id,
            user_email=user_email,
        )
        background_tasks.add_task(run_pipeline, video_location, interview_id)

        return {
            "status": "success",
            "message": "Processing started",
            "interview_id": interview_id,
            "credit_result": credit_result,
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Analyze Video Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/analyze-live-interview")
async def analyze_live_interview(
    background_tasks: BackgroundTasks,
    video: UploadFile = File(...),
    interview_id: str = Form(...),
    title: str = Form(...),
    user_email: str = Form(...),
    interview_type: str = Form("Live Simulation"),
    resume_context: str = Form(""),
    transcript: str = Form(""),
    code_snapshot: str = Form(""),
    duration_minutes: str = Form("15"),
):
    try:
        if not interview_id:
            raise HTTPException(status_code=400, detail="Interview ID is required.")
        if not user_email:
            raise HTTPException(status_code=400, detail="User email is required.")

        raw_filename = f"raw_{interview_id}.webm"
        raw_video_path = os.path.join("videos", raw_filename)
        video_filename = f"{interview_id}.webm"
        video_location = os.path.join("videos", video_filename)
        
        contents = await video.read()

        if not contents:
            raise HTTPException(status_code=400, detail="Uploaded live interview video is empty.")

        # Write the unindexed temporary buffer safely
        with open(raw_video_path, "wb") as buffer:
            buffer.write(contents)
            buffer.flush()
            os.fsync(buffer.fileno())

        # Intercept and heal the WebM container layout with FFmpeg prior to background tasks
        try:
            fix_webm_duration(raw_video_path, video_location)
        finally:
            if os.path.exists(raw_video_path):
                os.remove(raw_video_path)

        transcript_items = safe_json_loads(transcript, [])
        preliminary_score = build_basic_live_scores(transcript_items, code_snapshot)
        code_analysis_text = "Code analysis pending."

        if analyze_code and code_snapshot and len(code_snapshot.strip()) > 50:
            try:
                code_analysis_text = analyze_code(code_snapshot)
            except Exception as e:
                print(f"Live code analysis failed: {e}")
                code_analysis_text = "Code analysis failed during immediate live sync."

        update_data = {
            "interview_id": interview_id,
            "user_email": user_email,
            "title": title,
            "interview_type": interview_type,
            "resume_context": resume_context,
            "video_path": video_location,
            "status": "Analyzing Neural Feed...",
            "duration": f"{duration_minutes}:00",
            "transcript": transcript_items,
            "code_snapshot": code_snapshot,
            "code_analysis": code_analysis_text,
            "analysis": [preliminary_score],
            "session_type": "live",
            "created_at": utc_now(),
            "updated_at": utc_now(),
        }

        reports_collection.update_one(
            {"interview_id": interview_id},
            {"$set": update_data},
            upsert=True,
        )
        background_tasks.add_task(run_pipeline, video_location, interview_id)

        return {
            "status": "success",
            "message": "Live interview analysis started",
            "interview_id": interview_id,
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Analyze Live Interview Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/interviews")
def fetch_interviews(email: str = Query(None)):
    try:
        if email:
            reports_collection.update_many(
                {"$or": [{"user_email": {"$exists": False}}, {"user_email": None}, {"user_email": ""}]},
                {"$set": {"user_email": email}},
            )
        return {"data": get_all_interviews(user_email=email)}
    except Exception as e:
        print(f"Fetch Interviews Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/interview/{interview_id}")
def remove_interview(interview_id: str):
    try:
        if delete_interview(interview_id):
            return {"status": "success", "message": "Deleted"}
        raise HTTPException(status_code=404, detail="Interview not found.")
    except HTTPException:
        raise
    except Exception as e:
        print(f"Delete Interview Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/videos/{video_name}")
async def get_secure_video(video_name: str, email: str = Query(...)):
    try:
        record = reports_collection.find_one({"video_path": {"$regex": video_name}, "user_email": email})
        if not record:
            raise HTTPException(status_code=403, detail="Neural Access Denied: Unauthorized request for this resource.")

        file_path = os.path.join("videos", video_name)
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="Video file not found on local storage.")
        return FileResponse(file_path)
    except HTTPException:
        raise
    except Exception as e:
        print(f"Secure Video Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


app.include_router(mentor_router)
app.include_router(realtime_router)
app.include_router(gemini_live_router)

socket_app = socketio.ASGIApp(
    socketio_server=sio,
    other_asgi_app=app,
    socketio_path="socket.io",
)