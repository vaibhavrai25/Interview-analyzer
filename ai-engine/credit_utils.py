import os
import math
from datetime import datetime, timedelta, timezone
from typing import Any, Dict


def utc_now():
    return datetime.now(timezone.utc)


def env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return str(value).strip().lower() in {"1", "true", "yes", "y", "on"}


def get_credit_settings() -> Dict[str, Any]:
    return {
        "app_env": os.getenv("APP_ENV", "development").strip().lower(),
        "credits_enforced": env_bool("CREDITS_ENFORCED", False),
        "dev_unlimited_credits": env_bool("DEV_UNLIMITED_CREDITS", True),
        "dev_test_email": os.getenv("DEV_TEST_EMAIL", "").strip().lower(),
    }


def required_credits(duration_minutes: int | float | str) -> int:
    try:
        minutes = float(duration_minutes or 15)
    except Exception:
        minutes = 15
    return max(1, math.ceil(minutes / 15))


def is_dev_credit_bypass(user_email: str | None) -> bool:
    settings = get_credit_settings()
    email = (user_email or "").strip().lower()

    if settings["app_env"] == "production":
        return False

    if settings["credits_enforced"]:
        return False

    if not settings["dev_unlimited_credits"]:
        return False

    if not settings["dev_test_email"]:
        return True

    return email == settings["dev_test_email"]


def ensure_wallet(users_collection, user_email: str, user_name: str = "") -> Dict[str, Any]:
    if not user_email:
        raise ValueError("user_email is required")

    now = utc_now()
    expiry = now + timedelta(days=365)

    users_collection.update_one(
        {"email": user_email},
        {
            "$setOnInsert": {
                "email": user_email,
                "name": user_name or "Candidate",
                "created_at": now,
                "credit_wallet": {
                    "credits": 0,
                    "used": 0,
                    "total_purchased": 0,
                    "expires_at": expiry,
                    "updated_at": now,
                },
            }
        },
        upsert=True,
    )

    user = users_collection.find_one({"email": user_email}) or {}
    wallet = user.get("credit_wallet") or {}

    if not wallet:
        wallet = {
            "credits": 0,
            "used": 0,
            "total_purchased": 0,
            "expires_at": expiry,
            "updated_at": now,
        }
        users_collection.update_one({"email": user_email}, {"$set": {"credit_wallet": wallet}})

    return wallet


def serialize_wallet(users_collection, user_email: str) -> Dict[str, Any]:
    wallet = ensure_wallet(users_collection, user_email)
    settings = get_credit_settings()
    bypass = is_dev_credit_bypass(user_email)

    credits = int(wallet.get("credits", 0) or 0)
    used = int(wallet.get("used", 0) or 0)
    total_purchased = int(wallet.get("total_purchased", 0) or 0)
    expires_at = wallet.get("expires_at")

    if bypass:
        return {
            "credits": 9999,
            "used": used,
            "total_purchased": total_purchased,
            "expires_at": expires_at,
            "mode": "dev_unlimited",
            "is_dev_unlimited": True,
            "credits_enforced": settings["credits_enforced"],
            "message": "Developer mode: unlimited test credits are enabled.",
        }

    return {
        "credits": credits,
        "used": used,
        "total_purchased": total_purchased,
        "expires_at": expires_at,
        "mode": "paid_wallet",
        "is_dev_unlimited": False,
        "credits_enforced": settings["credits_enforced"],
    }


def can_start_interview(users_collection, user_email: str, duration_minutes: int | float | str) -> Dict[str, Any]:
    needed = required_credits(duration_minutes)

    if is_dev_credit_bypass(user_email):
        return {
            "allowed": True,
            "credits_required": needed,
            "credits_available": 9999,
            "credits_enforced": False,
            "mode": "dev_unlimited",
            "message": "Developer mode: allowed without deducting credits.",
        }

    wallet = ensure_wallet(users_collection, user_email)
    available = int(wallet.get("credits", 0) or 0)
    allowed = available >= needed

    return {
        "allowed": allowed,
        "credits_required": needed,
        "credits_available": available,
        "credits_enforced": get_credit_settings()["credits_enforced"],
        "mode": "paid_wallet",
        "message": "Allowed" if allowed else f"Insufficient credits. Need {needed}, available {available}.",
    }


def consume_credits(users_collection, user_email: str, duration_minutes: int | float | str, reason: str = "interview_start") -> Dict[str, Any]:
    needed = required_credits(duration_minutes)

    if is_dev_credit_bypass(user_email):
        return {
            "deducted": False,
            "credits_deducted": 0,
            "credits_required": needed,
            "credits_remaining": 9999,
            "mode": "dev_unlimited",
            "message": "Developer mode: no credits deducted.",
        }

    check = can_start_interview(users_collection, user_email, duration_minutes)

    if not check["allowed"]:
        return {
            "deducted": False,
            "credits_deducted": 0,
            "credits_required": needed,
            "credits_remaining": check["credits_available"],
            "mode": "paid_wallet",
            "message": check["message"],
        }

    now = utc_now()
    result = users_collection.update_one(
        {"email": user_email, "credit_wallet.credits": {"$gte": needed}},
        {
            "$inc": {
                "credit_wallet.credits": -needed,
                "credit_wallet.used": needed,
            },
            "$set": {"credit_wallet.updated_at": now},
            "$push": {
                "credit_ledger": {
                    "type": "debit",
                    "credits": needed,
                    "reason": reason,
                    "created_at": now,
                }
            },
        },
    )

    if result.modified_count != 1:
        latest = ensure_wallet(users_collection, user_email)
        return {
            "deducted": False,
            "credits_deducted": 0,
            "credits_required": needed,
            "credits_remaining": int(latest.get("credits", 0) or 0),
            "mode": "paid_wallet",
            "message": "Credit deduction failed. Please retry.",
        }

    latest = ensure_wallet(users_collection, user_email)
    return {
        "deducted": True,
        "credits_deducted": needed,
        "credits_required": needed,
        "credits_remaining": int(latest.get("credits", 0) or 0),
        "mode": "paid_wallet",
        "message": "Credits deducted successfully.",
    }


def dev_topup(users_collection, user_email: str, credits: int, reason: str = "dev_topup") -> Dict[str, Any]:
    settings = get_credit_settings()
    if settings["app_env"] == "production":
        raise PermissionError("Dev top-up is disabled in production.")

    if credits <= 0:
        raise ValueError("credits must be positive")

    now = utc_now()
    expiry = now + timedelta(days=365)
    ensure_wallet(users_collection, user_email)

    users_collection.update_one(
        {"email": user_email},
        {
            "$inc": {
                "credit_wallet.credits": int(credits),
                "credit_wallet.total_purchased": int(credits),
            },
            "$set": {
                "credit_wallet.expires_at": expiry,
                "credit_wallet.updated_at": now,
            },
            "$push": {
                "credit_ledger": {
                    "type": "credit",
                    "credits": int(credits),
                    "reason": reason,
                    "created_at": now,
                    "expires_at": expiry,
                }
            },
        },
    )

    return serialize_wallet(users_collection, user_email)