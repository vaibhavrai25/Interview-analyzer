from pydantic import BaseModel, EmailStr
from passlib.context import CryptContext
import jwt
from datetime import datetime, timedelta, timezone
import os

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
SECRET_KEY = os.getenv("JWT_SECRET", "CHANGE_THIS_SECRET_IN_ENV")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = int(os.getenv("ACCESS_TOKEN_EXPIRE_HOURS", "24"))


class UserRegister(BaseModel):
    email: EmailStr
    password: str
    name: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class CreditConsumeRequest(BaseModel):
    duration_minutes: int = 15
    reason: str = "interview"
    interview_id: str | None = None
    engine: str = "gemini"


class CreditGrantRequest(BaseModel):
    pack_id: str
    payment_id: str | None = None


def normalize_email(email: str) -> str:
    return str(email or "").strip().lower()


def validate_password_strength(password: str) -> None:
    if not password or len(password) < 8:
        raise ValueError("Password must be at least 8 characters long.")
    if len(password) > 72:
        raise ValueError("Password must be 72 characters or fewer.")
    if not any(ch.isupper() for ch in password):
        raise ValueError("Password must contain at least one uppercase letter.")
    if not any(ch.islower() for ch in password):
        raise ValueError("Password must contain at least one lowercase letter.")
    if not any(ch.isdigit() for ch in password):
        raise ValueError("Password must contain at least one number.")


def hash_password(password: str):
    validate_password_strength(password)
    return pwd_context.hash(password[:72])


def verify_password(plain_password, hashed_password):
    safe_password = str(plain_password or "")[:72]
    return pwd_context.verify(safe_password, hashed_password)


def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    to_encode.update({"exp": expire, "iat": datetime.now(timezone.utc)})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str):
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])