import os
import hmac
import json
import uuid
import hashlib
import base64
from datetime import datetime, timezone, timedelta
from typing import Dict, Any

import httpx


RAZORPAY_API_BASE = "https://api.razorpay.com/v1"

CREDIT_PACKS = {
    "pack_3": {
        "id": "pack_3",
        "label": "Starter",
        "credits": 3,
        "minutes": 45,
        "amount_rupees": 49,
        "amount_paise": 4900,
        "currency": "INR",
        "expires_days": 365,
    },
    "pack_5": {
        "id": "pack_5",
        "label": "Value",
        "credits": 5,
        "minutes": 75,
        "amount_rupees": 99,
        "amount_paise": 9900,
        "currency": "INR",
        "expires_days": 365,
    },
    "pack_10": {
        "id": "pack_10",
        "label": "Pro",
        "credits": 10,
        "minutes": 150,
        "amount_rupees": 199,
        "amount_paise": 19900,
        "currency": "INR",
        "expires_days": 365,
    },
    "pack_20": {
        "id": "pack_20",
        "label": "Power",
        "credits": 20,
        "minutes": 300,
        "amount_rupees": 349,
        "amount_paise": 34900,
        "currency": "INR",
        "expires_days": 365,
    },
}


def utc_now():
    return datetime.now(timezone.utc)


def serialize_dt(value):
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def get_razorpay_key_id():
    return os.getenv("RAZORPAY_KEY_ID", "").strip()


def get_razorpay_key_secret():
    return os.getenv("RAZORPAY_KEY_SECRET", "").strip()


def get_razorpay_webhook_secret():
    return os.getenv("RAZORPAY_WEBHOOK_SECRET", "").strip()


def get_basic_auth_header():
    key_id = get_razorpay_key_id()
    key_secret = get_razorpay_key_secret()

    if not key_id or not key_secret:
        raise ValueError("RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET missing in backend .env")

    token = base64.b64encode(f"{key_id}:{key_secret}".encode()).decode()
    return {"Authorization": f"Basic {token}"}


def get_pack(pack_id: str) -> Dict[str, Any]:
    pack = CREDIT_PACKS.get(pack_id)

    if not pack:
        raise ValueError("Invalid credit pack selected.")

    return pack


async def create_razorpay_order(email: str, pack_id: str) -> Dict[str, Any]:
    email = str(email or "").strip().lower()

    if not email:
        raise ValueError("Email is required.")

    pack = get_pack(pack_id)

    receipt = f"jarvis_{pack_id}_{uuid.uuid4().hex[:18]}"

    payload = {
        "amount": int(pack["amount_paise"]),
        "currency": pack["currency"],
        "receipt": receipt,
        "notes": {
            "email": email,
            "pack_id": pack_id,
            "credits": str(pack["credits"]),
            "product": "jarvis_interview_credits",
        },
    }

    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(
            f"{RAZORPAY_API_BASE}/orders",
            headers={
                **get_basic_auth_header(),
                "Content-Type": "application/json",
            },
            json=payload,
        )

    try:
        data = response.json()
    except Exception:
        data = {"raw": response.text}

    if response.status_code >= 400:
        message = data.get("error", {}).get("description") or data.get("message") or "Razorpay order creation failed."
        raise ValueError(message)

    return data


async def fetch_razorpay_payment(payment_id: str) -> Dict[str, Any]:
    if not payment_id:
        raise ValueError("Payment ID missing.")

    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.get(
            f"{RAZORPAY_API_BASE}/payments/{payment_id}",
            headers=get_basic_auth_header(),
        )

    data = response.json()

    if response.status_code >= 400:
        message = data.get("error", {}).get("description") or "Could not fetch Razorpay payment."
        raise ValueError(message)

    return data


async def fetch_razorpay_order(order_id: str) -> Dict[str, Any]:
    if not order_id:
        raise ValueError("Order ID missing.")

    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.get(
            f"{RAZORPAY_API_BASE}/orders/{order_id}",
            headers=get_basic_auth_header(),
        )

    data = response.json()

    if response.status_code >= 400:
        message = data.get("error", {}).get("description") or "Could not fetch Razorpay order."
        raise ValueError(message)

    return data


def verify_checkout_signature(order_id: str, payment_id: str, signature: str) -> bool:
    secret = get_razorpay_key_secret()

    if not secret:
        raise ValueError("RAZORPAY_KEY_SECRET missing.")

    body = f"{order_id}|{payment_id}"

    expected = hmac.new(
        secret.encode(),
        body.encode(),
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(expected, signature or "")


def verify_webhook_signature(raw_body: bytes, signature: str) -> bool:
    secret = get_razorpay_webhook_secret()

    if not secret:
        raise ValueError("RAZORPAY_WEBHOOK_SECRET missing.")

    expected = hmac.new(
        secret.encode(),
        raw_body,
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(expected, signature or "")


def serialize_payment_doc(doc: Dict[str, Any]) -> Dict[str, Any]:
    if not doc:
        return {}

    out = dict(doc)

    if "_id" in out:
        out["_id"] = str(out["_id"])

    for key in [
        "created_at",
        "updated_at",
        "paid_at",
        "failed_at",
        "credited_at",
        "expires_at",
    ]:
        out[key] = serialize_dt(out.get(key))

    return out


def add_paid_credits_once(users_collection, payments_collection, payment_doc: Dict[str, Any]) -> Dict[str, Any]:
    if not payment_doc:
        raise ValueError("Payment document missing.")

    if payment_doc.get("credits_added") is True:
        return {
            "already_credited": True,
            "message": "Credits already added for this payment.",
        }

    email = str(payment_doc.get("email") or "").strip().lower()
    credits = int(payment_doc.get("credits") or 0)
    pack_id = payment_doc.get("pack_id")
    order_id = payment_doc.get("razorpay_order_id")
    payment_id = payment_doc.get("razorpay_payment_id")
    expires_days = int(payment_doc.get("expires_days") or 365)

    if not email:
        raise ValueError("Payment email missing.")

    if credits <= 0:
        raise ValueError("Invalid credit amount.")

    now = utc_now()
    expires_at = now + timedelta(days=expires_days)

    update_result = payments_collection.update_one(
        {
            "razorpay_order_id": order_id,
            "credits_added": {"$ne": True},
        },
        {
            "$set": {
                "credits_added": True,
                "credited_at": now,
                "expires_at": expires_at,
                "updated_at": now,
            }
        },
    )

    if update_result.modified_count != 1:
        return {
            "already_credited": True,
            "message": "Credits already added or payment not found.",
        }

    users_collection.update_one(
        {"email": email},
        {
            "$setOnInsert": {
                "email": email,
                "name": "Candidate",
                "created_at": now,
            },
            "$inc": {
                "credit_wallet.credits": credits,
                "credit_wallet.total_purchased": credits,
            },
            "$set": {
                "credit_wallet.expires_at": expires_at,
                "credit_wallet.updated_at": now,
                "updated_at": now,
            },
            "$push": {
                "credit_ledger": {
                    "type": "credit",
                    "credits": credits,
                    "reason": "razorpay_purchase",
                    "source": "razorpay",
                    "pack_id": pack_id,
                    "razorpay_order_id": order_id,
                    "razorpay_payment_id": payment_id,
                    "created_at": now,
                    "expires_at": expires_at,
                }
            },
        },
        upsert=True,
    )

    return {
        "already_credited": False,
        "credits_added": credits,
        "expires_at": expires_at,
        "message": "Credits added successfully.",
    }


def normalize_payment_status(payment_data: Dict[str, Any]) -> str:
    status = str(payment_data.get("status") or "").lower()

    if status in {"captured", "authorized"}:
        return "paid"

    if status in {"failed"}:
        return "failed"

    return status or "unknown"


def build_payment_document(email: str, pack: Dict[str, Any], order: Dict[str, Any]) -> Dict[str, Any]:
    now = utc_now()

    return {
        "email": str(email or "").strip().lower(),
        "pack_id": pack["id"],
        "pack_label": pack["label"],
        "credits": int(pack["credits"]),
        "minutes": int(pack["minutes"]),
        "amount_rupees": int(pack["amount_rupees"]),
        "amount_paise": int(pack["amount_paise"]),
        "currency": pack["currency"],
        "expires_days": int(pack["expires_days"]),
        "razorpay_order_id": order.get("id"),
        "razorpay_payment_id": "",
        "razorpay_signature": "",
        "receipt": order.get("receipt"),
        "status": "created",
        "credits_added": False,
        "raw_order": order,
        "raw_payment": {},
        "raw_verify": {},
        "created_at": now,
        "updated_at": now,
    }