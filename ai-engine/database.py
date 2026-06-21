import os
import uuid
import cloudinary.uploader
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient, DESCENDING, ASCENDING
from dotenv import load_dotenv

load_dotenv()

MONGO_URL = os.getenv("MONGO_URL")
client = MongoClient(MONGO_URL)
db = client["interview_analyzer"]

reports_collection = db["reports"]
users_collection = db["users"]
credit_transactions_collection = db["credit_transactions"]
payments_collection = db["payments"]

try:
    reports_collection.create_index([("interview_id", ASCENDING)], unique=True)
    reports_collection.create_index([("user_email", ASCENDING)])

    users_collection.create_index([("email", ASCENDING)], unique=True)

    credit_transactions_collection.create_index([("email", ASCENDING)])
    credit_transactions_collection.create_index([("created_at", DESCENDING)])

    payments_collection.create_index([("email", ASCENDING)])
    payments_collection.create_index([("created_at", DESCENDING)])
    payments_collection.create_index([("razorpay_order_id", ASCENDING)], unique=True)
    payments_collection.create_index([("razorpay_payment_id", ASCENDING)])
    payments_collection.create_index([("status", ASCENDING)])
except Exception as e:
    print(f"⚠️ Mongo index warning: {e}")


CREDIT_PACKS = {
    "trial": {"label": "Free Trial", "credits": 1, "price": 0, "expires_days": 7},
    "pack_3": {"label": "Starter", "credits": 3, "price": 49, "expires_days": 365},
    "pack_5": {"label": "Value", "credits": 5, "price": 99, "expires_days": 365},
    "pack_10": {"label": "Pro", "credits": 10, "price": 199, "expires_days": 365},
    "pack_20": {"label": "Power", "credits": 20, "price": 349, "expires_days": 365},
}


def utc_now():
    return datetime.now(timezone.utc)


def serialize_dt(value):
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def serialize_batch(batch):
    return {
        "batch_id": batch.get("batch_id"),
        "source": batch.get("source"),
        "credits_total": int(batch.get("credits_total", 0)),
        "credits_remaining": int(batch.get("credits_remaining", 0)),
        "created_at": serialize_dt(batch.get("created_at")),
        "expires_at": serialize_dt(batch.get("expires_at")),
    }


def clean_expired_credit_batches(email: str):
    now = utc_now()
    user = users_collection.find_one({"email": email}) or {}
    batches = user.get("credit_batches", []) or []

    changed = False
    cleaned = []
    expired_credits = 0

    for batch in batches:
        expires_at = batch.get("expires_at")
        remaining = int(batch.get("credits_remaining", 0))

        if expires_at and expires_at < now and remaining > 0:
            batch["credits_remaining"] = 0
            expired_credits += remaining
            changed = True

        cleaned.append(batch)

    total = sum(int(b.get("credits_remaining", 0)) for b in cleaned)

    if changed:
        users_collection.update_one(
            {"email": email},
            {
                "$set": {
                    "credit_batches": cleaned,
                    "credit_balance": total,
                    "updated_at": now,
                }
            },
        )
        credit_transactions_collection.insert_one(
            {
                "email": email,
                "type": "expire",
                "credits": expired_credits,
                "created_at": now,
                "note": "Expired unused credits",
            }
        )

    return total, cleaned


def get_credit_summary(email: str):
    email = str(email or "").strip().lower()
    total, batches = clean_expired_credit_batches(email)
    user = users_collection.find_one({"email": email}) or {}
    return {
        "email": email,
        "credits": total,
        "credit_balance": total,
        "trial_claimed": bool(user.get("trial_claimed", False)),
        "batches": [
            serialize_batch(b)
            for b in batches
            if int(b.get("credits_remaining", 0)) > 0
        ],
        "plans": CREDIT_PACKS,
    }


def add_credits(email: str, credits: int, source: str, expires_days: int = 365, payment_id: str | None = None):
    email = str(email or "").strip().lower()
    now = utc_now()
    batch = {
        "batch_id": str(uuid.uuid4()),
        "source": source,
        "credits_total": int(credits),
        "credits_remaining": int(credits),
        "created_at": now,
        "expires_at": now + timedelta(days=expires_days),
        "payment_id": payment_id,
    }

    users_collection.update_one(
        {"email": email},
        {
            "$push": {"credit_batches": batch},
            "$inc": {"credit_balance": int(credits)},
            "$set": {"updated_at": now},
        },
        upsert=True,
    )

    credit_transactions_collection.insert_one(
        {
            "email": email,
            "type": "credit",
            "credits": int(credits),
            "source": source,
            "batch_id": batch["batch_id"],
            "payment_id": payment_id,
            "created_at": now,
            "expires_at": batch["expires_at"],
        }
    )

    return get_credit_summary(email)


def grant_free_trial_if_available(email: str):
    email = str(email or "").strip().lower()
    user = users_collection.find_one({"email": email}) or {}

    if user.get("trial_claimed"):
        return {"granted": False, **get_credit_summary(email)}

    users_collection.update_one(
        {"email": email},
        {"$set": {"trial_claimed": True, "updated_at": utc_now()}},
        upsert=True,
    )
    summary = add_credits(email, 1, "free_trial", expires_days=7)
    return {"granted": True, **summary}


def consume_credits(email: str, credits_required: int, reason: str = "interview", metadata: dict | None = None):
    email = str(email or "").strip().lower()
    credits_required = int(credits_required)
    now = utc_now()
    total, batches = clean_expired_credit_batches(email)

    if credits_required <= 0:
        return {"success": True, **get_credit_summary(email)}

    if total < credits_required:
        return {
            "success": False,
            "message": "Insufficient credits",
            "credits_required": credits_required,
            **get_credit_summary(email),
        }

    remaining_to_consume = credits_required
    updated_batches = []

    batches = sorted(batches, key=lambda b: b.get("expires_at") or now)

    for batch in batches:
        batch_remaining = int(batch.get("credits_remaining", 0))

        if batch_remaining <= 0:
            updated_batches.append(batch)
            continue

        take = min(batch_remaining, remaining_to_consume)
        batch["credits_remaining"] = batch_remaining - take
        remaining_to_consume -= take
        updated_batches.append(batch)

    new_total = sum(int(b.get("credits_remaining", 0)) for b in updated_batches)

    users_collection.update_one(
        {"email": email},
        {
            "$set": {
                "credit_batches": updated_batches,
                "credit_balance": new_total,
                "updated_at": now,
            }
        },
    )

    credit_transactions_collection.insert_one(
        {
            "email": email,
            "type": "debit",
            "credits": credits_required,
            "reason": reason,
            "metadata": metadata or {},
            "created_at": now,
        }
    )

    return {
        "success": True,
        "credits_used": credits_required,
        **get_credit_summary(email),
    }


def save_interview(
    video_path: str,
    report: dict,
    title: str = "Untitled Interview",
    interview_type: str = "Technical",
    interview_id: str = None,
    user_email: str = None,
):
    if report is None:
        print("❌ Cannot save: Report is None")
        return None

    final_id = interview_id if interview_id else str(uuid.uuid4())

    document = {
        "interview_id": final_id,
        "user_email": user_email,
        "title": title,
        "interview_type": interview_type,
        "video_path": video_path,
        "is_pinned": False,
        "status": report.get("status", "Processing..."),
        "duration": report.get("duration", "0:00"),
        "transcript": report.get("transcript", ""),
        "analysis": report.get("qa_analysis", []),
        "emotions": report.get("emotion_analysis", {}),
        "code_snapshot": report.get("code_snapshot", ""),
        "code_analysis": report.get("code_analysis", ""),
        "session_type": report.get("session_type", "uploaded"),
        "ai_questions": report.get("ai_questions", []),
        "user_answers": report.get("user_answers", []),
        "mentor_chat_history": [],
        "interview_duration": report.get("interview_duration", "30"),
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }

    try:
        reports_collection.update_one(
            {"interview_id": final_id},
            {"$setOnInsert": document},
            upsert=True,
        )
        print(f"✅ Successfully saved to Mongo! ID: {final_id}")
        return final_id
    except Exception as e:
        print(f"❌ Mongo Save Error: {e}")
        return None


def update_interview_status(interview_id: str, status: str, duration: str = None):
    try:
        update_data = {"status": status, "updated_at": datetime.now(timezone.utc)}
        if duration:
            update_data["duration"] = duration

        reports_collection.update_one(
            {"interview_id": interview_id},
            {"$set": update_data},
        )
    except Exception as e:
        print(f"❌ Status Update Error: {e}")


def update_interview(interview_id: str, data: dict):
    try:
        clean_data = {k: v for k, v in data.items() if v is not None}
        clean_data["updated_at"] = datetime.now(timezone.utc)
        result = reports_collection.update_one(
            {"interview_id": interview_id},
            {"$set": clean_data},
        )
        return result.matched_count > 0
    except Exception as e:
        print(f"❌ Update Error: {e}")
        return False


def delete_interview(interview_id: str):
    try:
        interview = reports_collection.find_one({"interview_id": interview_id})
        if interview and "interview_videos/" in interview.get("video_path", ""):
            cloudinary.uploader.destroy(
                f"interview_videos/{interview_id}",
                resource_type="video",
            )

        result = reports_collection.delete_one({"interview_id": interview_id})
        return result.deleted_count > 0
    except Exception as e:
        print(f"❌ Delete Error: {e}")
        return False


def get_all_interviews(user_email: str = None):
    interviews = []
    query = {"user_email": user_email} if user_email else {}

    try:
        cursor = reports_collection.find(query).sort(
            [
                ("is_pinned", DESCENDING),
                ("created_at", DESCENDING),
            ]
        )
        for item in cursor:
            item["_id"] = str(item["_id"])
            interviews.append(item)
    except Exception as e:
        print(f"❌ Fetch Error: {e}")

    return interviews


def get_interview_by_id(interview_id: str):
    try:
        interview = reports_collection.find_one({"interview_id": interview_id})
        if interview:
            interview["_id"] = str(interview["_id"])
        return interview
    except Exception as e:
        print(f"❌ Fetch Interview Error: {e}")
        return None