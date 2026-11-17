import os
from dotenv import load_dotenv
import time
import httpx
import json
import base64
import binascii
from fastapi.responses import FileResponse
import io
import hashlib
import uuid
from pathlib import Path
from typing import Literal
from PIL import Image, UnidentifiedImageError
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import bcrypt
import jwt
from datetime import datetime, timedelta, timezone

from database import engine, SessionLocal
import models

app = FastAPI()

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

models.Base.metadata.create_all(bind=engine)

load_dotenv(Path(__file__).parent / ".env")

SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("SECRET_KEY missing in .env file")
ALGORITHM = "HS256"
TOKEN_EXPIRE_MINUTES = 30
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

origins = [
    o.strip()
    for o in os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000",
    ).split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

UPLOAD_DIR = Path(__file__).parent / "uploads_data"
UPLOAD_DIR.mkdir(exist_ok=True)
MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB
ALLOWED_FORMATS = {"JPEG": "jpg", "PNG": "png"}

IMAGE_LINK_EXPIRE_MINUTES = 5
HEATMAP_LINK_EXPIRE_MINUTES = 5
MAX_HEATMAP_BYTES = 5 * 1024 * 1024  # 5 MB
AI_TIMEOUT_SECONDS = 10.0
AI_HEATMAP_TIMEOUT_SECONDS = 30.0  # heatmap banane mein zyada time lag sakta hai
HEATMAP_NOTE = (
    "Shows which pixels changed the model output the most. It is not proof of a finding."
)

AI_SERVICE_URL = os.getenv("AI_SERVICE_URL", "http://127.0.0.1:8001")

MAX_RETRIES = 3


def call_ai_service(
    image_bytes: bytes, filename: str, content_type: str, include_heatmap: bool = False
) -> dict:
    timeout = AI_HEATMAP_TIMEOUT_SECONDS if include_heatmap else AI_TIMEOUT_SECONDS
    last_error = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = httpx.post(
                f"{AI_SERVICE_URL}/predict",
                files={"file": (filename, image_bytes, content_type)},
                data={"include_heatmap": "true" if include_heatmap else "false"},
                timeout=timeout,
            )
            # 4xx = hamari galti (galat image), retry ka fayda nahi
            if 400 <= response.status_code < 500:
                raise HTTPException(
                    status_code=400, detail="AI service rejected the image"
                )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPError as e:
            last_error = e
            if attempt < MAX_RETRIES:
                time.sleep(attempt)  # 1 sec, phir 2 sec rukna
    raise last_error


def save_heatmap(heatmap_b64):
    """AI service ka base64 PNG check karke private folder mein save karo. Galat ho to None."""
    if not heatmap_b64 or not isinstance(heatmap_b64, str):
        return None
    try:
        raw = base64.b64decode(heatmap_b64, validate=True)
    except (binascii.Error, ValueError):
        return None
    if not raw or len(raw) > MAX_HEATMAP_BYTES:
        return None
    try:
        img = Image.open(io.BytesIO(raw))
        img.verify()
        if Image.open(io.BytesIO(raw)).format != "PNG":
            return None
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError):
        return None
    name = f"{uuid.uuid4().hex}_heatmap.png"
    (UPLOAD_DIR / name).write_bytes(raw)
    return name


# Har request ke liye database session kholta hai, kaam ke baad band karta hai
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email = payload.get("sub")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user = db.query(models.User).filter(models.User.email == email).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or deactivated")
    return user


def log_action(db: Session, action: str, user_id: int = None, detail: str = None):
    db.add(models.AuditLog(user_id=user_id, action=action, detail=detail))
    db.commit()


def require_role(*allowed_roles: str):
    def checker(current_user: models.User = Depends(get_current_user)):
        if current_user.role not in allowed_roles:
            raise HTTPException(status_code=403, detail="Not enough permissions")
        return current_user
    return checker


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def latest_prediction(db: Session, assessment_id: int):
    return (
        db.query(models.Prediction)
        .filter(models.Prediction.assessment_id == assessment_id)
        .order_by(models.Prediction.id.desc())
        .first()
    )


def get_prediction_for_user(db: Session, prediction_id: int, user: models.User):
    pred = db.query(models.Prediction).filter(models.Prediction.id == prediction_id).first()
    if not pred:
        raise HTTPException(status_code=404, detail="Prediction not found")
    if user.role not in ("doctor", "admin"):
        owner = (
            db.query(models.Assessment)
            .filter(
                models.Assessment.id == pred.assessment_id,
                models.Assessment.user_id == user.id,
            )
            .first()
        )
        if not owner:
            raise HTTPException(status_code=404, detail="Prediction not found")
    return pred


class UserRegister(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)


@app.get("/")
def home():
    return {"message": "Hello, backend is running!"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/register", status_code=201)
@limiter.limit("10/minute")
def register(request: Request, user: UserRegister, db: Session = Depends(get_db)):
    # 1. Check karo ki email pehle se to nahi hai
    existing = db.query(models.User).filter(models.User.email == user.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    # 2. Naya user banao aur database mein save karo (password hash ke saath)
    new_user = models.User(
        name=user.name,
        email=user.email,
        password_hash=hash_password(user.password),
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # 3. Response (password kabhi wapas nahi bhejte)
    return {
        "message": "User registered successfully",
        "id": new_user.id,
        "name": new_user.name,
        "email": new_user.email,
        "role": new_user.role,
    }


@app.post("/login")
@limiter.limit("5/minute")
def login(
    request: Request,
    form: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    db_user = db.query(models.User).filter(models.User.email == form.username).first()

    if not db_user or not bcrypt.checkpw(
        form.password.encode("utf-8"), db_user.password_hash.encode("utf-8")
    ):
        log_action(db, "login_failed", detail=form.username)
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not db_user.is_active:
        log_action(db, "login_blocked_inactive", user_id=db_user.id)
        raise HTTPException(status_code=403, detail="Account is deactivated")

    log_action(db, "login_success", user_id=db_user.id)

    expire = datetime.now(timezone.utc) + timedelta(minutes=TOKEN_EXPIRE_MINUTES)
    token = jwt.encode(
        {"sub": db_user.email, "role": db_user.role, "exp": expire},
        SECRET_KEY,
        algorithm=ALGORITHM,
    )
    return {"access_token": token, "token_type": "bearer"}


@app.get("/me")
def read_me(current_user: models.User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "role": current_user.role,
    }


# ---------------- Admin ----------------

@app.get("/admin/users")
def list_users(
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_role("admin")),
):
    users = db.query(models.User).all()
    return [
        {"id": u.id, "name": u.name, "email": u.email, "role": u.role, "is_active": u.is_active}
        for u in users
    ]


class AdminUserCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    role: Literal["patient", "doctor", "admin"] = "patient"


@app.post("/admin/users", status_code=201)
def admin_create_user(
    body: AdminUserCreate,
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_role("admin")),
):
    existing = db.query(models.User).filter(models.User.email == body.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    new_user = models.User(
        name=body.name,
        email=body.email,
        password_hash=hash_password(body.password),
        role=body.role,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    log_action(
        db,
        "user_created_by_admin",
        user_id=admin.id,
        detail=f"target_user_id={new_user.id}, role={new_user.role}",
    )
    return {
        "id": new_user.id,
        "name": new_user.name,
        "email": new_user.email,
        "role": new_user.role,
        "is_active": new_user.is_active,
    }


class RoleIn(BaseModel):
    role: Literal["patient", "doctor", "admin"]


@app.put("/admin/users/{user_id}/role")
def set_user_role(
    user_id: int,
    body: RoleIn,
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_role("admin")),
):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="You cannot change your own role")

    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.role = body.role
    db.commit()
    log_action(
        db,
        "user_role_changed",
        user_id=admin.id,
        detail=f"target_user_id={user.id}, role={user.role}",
    )
    return {"id": user.id, "email": user.email, "role": user.role}


class ActiveIn(BaseModel):
    is_active: bool


@app.put("/admin/users/{user_id}/active")
def set_user_active(
    user_id: int,
    body: ActiveIn,
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_role("admin")),
):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="You cannot change your own status")

    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.is_active = body.is_active
    db.commit()
    log_action(
        db,
        "user_activated" if body.is_active else "user_deactivated",
        user_id=admin.id,
        detail=f"target_user_id={user.id}",
    )
    return {"id": user.id, "email": user.email, "is_active": user.is_active}


@app.get("/admin/audit-logs")
def list_audit_logs(
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_role("admin")),
):
    logs = (
        db.query(models.AuditLog)
        .order_by(models.AuditLog.id.desc())
        .limit(100)
        .all()
    )
    return [
        {
            "id": l.id,
            "user_id": l.user_id,
            "action": l.action,
            "detail": l.detail,
            "created_at": l.created_at,
        }
        for l in logs
    ]


# ---------------- Patient: assessments ----------------

@app.post("/assessments", status_code=201)
def create_assessment(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    assessment = models.Assessment(user_id=current_user.id)
    db.add(assessment)
    db.commit()
    db.refresh(assessment)
    return {
        "id": assessment.id,
        "status": assessment.status,
        "created_at": assessment.created_at,
    }


@app.get("/assessments")
def my_assessments(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    items = (
        db.query(models.Assessment)
        .filter(models.Assessment.user_id == current_user.id)
        .all()
    )
    result = []
    for a in items:
        latest = latest_prediction(db, a.id)
        images = (
            db.query(models.ImageAsset)
            .filter(models.ImageAsset.assessment_id == a.id)
            .all()
        )
        result.append(
            {
                "id": a.id,
                "status": a.status,
                "created_at": a.created_at,
                "predicted_class": latest.predicted_class if latest else None,
                "probabilities": json.loads(latest.probabilities) if latest else None,
                "model_version": latest.model_version if latest else None,
                "prediction_id": latest.id if latest else None,
                "has_heatmap": bool(latest and latest.heatmap_name),
                "image_ids": [i.id for i in images],
            }
        )
    return result


@app.get("/assessments/{assessment_id}")
def my_assessment_detail(
    assessment_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    a = (
        db.query(models.Assessment)
        .filter(
            models.Assessment.id == assessment_id,
            models.Assessment.user_id == current_user.id,
        )
        .first()
    )
    if not a:
        raise HTTPException(status_code=404, detail="Assessment not found")

    images = db.query(models.ImageAsset).filter(models.ImageAsset.assessment_id == a.id).all()
    preds = db.query(models.Prediction).filter(models.Prediction.assessment_id == a.id).all()

    result = []
    for p in preds:
        reviews = (
            db.query(models.DoctorReview)
            .filter(models.DoctorReview.prediction_id == p.id)
            .all()
        )
        result.append(
            {
                "id": p.id,
                "predicted_class": p.predicted_class,
                "probabilities": json.loads(p.probabilities),
                "model_version": p.model_version,
                "has_heatmap": p.heatmap_name is not None,
                "disclaimer": "Screening support only, not a diagnosis.",
                "reviews": [
                    {"comment": r.comment, "agrees": r.agrees, "created_at": r.created_at}
                    for r in reviews
                ],
            }
        )

    return {
        "id": a.id,
        "status": a.status,
        "created_at": a.created_at,
        "image_ids": [i.id for i in images],
        "predictions": result,
    }


@app.post("/assessments/{assessment_id}/image", status_code=201)
def upload_image(
    assessment_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # 1. Assessment hai aur isi user ka hai?
    assessment = (
        db.query(models.Assessment)
        .filter(
            models.Assessment.id == assessment_id,
            models.Assessment.user_id == current_user.id,
        )
        .first()
    )
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")

    # 2. File padho (size limit ke saath)
    data = file.file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) == 0:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 10 MB)")

    # 3. Pillow se check: kya yeh sach mein image hai?
    try:
        img = Image.open(io.BytesIO(data))
        img.verify()  # corrupt file pakadta hai
        img = Image.open(io.BytesIO(data))  # verify ke baad dobara kholna padta hai
    except (UnidentifiedImageError, OSError):
        raise HTTPException(status_code=400, detail="Invalid or corrupt image")

    # 4. Sirf JPEG / PNG
    fmt = img.format
    if fmt not in ALLOWED_FORMATS:
        raise HTTPException(
            status_code=415, detail="Only JPEG and PNG images are allowed"
        )

    # 5. Metadata hatao: sirf pixels ko naye image mein copy karo
    clean = Image.new(img.mode, img.size)
    clean.putdata(list(img.getdata()))
    buffer = io.BytesIO()
    clean.save(buffer, format=fmt)
    clean_bytes = buffer.getvalue()

    # 6. Hash, random naam, save
    sha256 = hashlib.sha256(clean_bytes).hexdigest()
    stored_name = f"{uuid.uuid4().hex}.{ALLOWED_FORMATS[fmt]}"
    (UPLOAD_DIR / stored_name).write_bytes(clean_bytes)

    # 7. Database record
    asset = models.ImageAsset(
        assessment_id=assessment.id,
        stored_name=stored_name,
        size_bytes=len(clean_bytes),
        content_type=f"image/{ALLOWED_FORMATS[fmt]}".replace("jpg", "jpeg"),
        sha256=sha256,
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)

    log_action(db, "image_uploaded", user_id=current_user.id, detail=f"image_id={asset.id}")

    return {
        "id": asset.id,
        "assessment_id": asset.assessment_id,
        "size_bytes": asset.size_bytes,
        "content_type": asset.content_type,
        "sha256": asset.sha256,
    }


@app.post("/assessments/{assessment_id}/predict", status_code=201)
def run_prediction(
    assessment_id: int,
    heatmap: bool = False,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # 1. Assessment isi user ki hai?
    assessment = (
        db.query(models.Assessment)
        .filter(
            models.Assessment.id == assessment_id,
            models.Assessment.user_id == current_user.id,
        )
        .first()
    )
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")

    # 2. Is assessment ki image hai?
    asset = (
        db.query(models.ImageAsset)
        .filter(models.ImageAsset.assessment_id == assessment.id)
        .order_by(models.ImageAsset.id.desc())
        .first()
    )
    if not asset:
        raise HTTPException(status_code=400, detail="Upload an image first")

    # 3. Image padho aur AI service ko bhejo
    image_bytes = (UPLOAD_DIR / asset.stored_name).read_bytes()
    try:
        result = call_ai_service(
            image_bytes,
            asset.stored_name,
            asset.content_type or "image/jpeg",
            include_heatmap=heatmap,
        )
    except httpx.HTTPError:
        raise HTTPException(status_code=503, detail="AI service unavailable")

    # AI service ke dono format chalenge (mock aur Member 3 ki real service)
    predicted_class = result.get("predicted_class") or result.get("predicted_category")
    probabilities = result.get("probabilities") or result.get("model_scores")
    if not predicted_class or not probabilities:
        raise HTTPException(status_code=502, detail="AI service returned an unexpected response")

    # Heatmap (sirf jab maangi gayi ho): check karke private folder mein save karo
    heatmap_name = save_heatmap(result.get("heatmap_base64")) if heatmap else None

    # 4. Result save karo
    prediction = models.Prediction(
        assessment_id=assessment.id,
        predicted_class=predicted_class,
        probabilities=json.dumps(probabilities),
        model_version=result.get("model_version", "unknown"),
        heatmap_name=heatmap_name,
    )
    db.add(prediction)
    assessment.status = "completed"
    db.commit()
    db.refresh(prediction)

    log_action(db, "prediction_run", user_id=current_user.id, detail=f"prediction_id={prediction.id}")

    response = {
        "id": prediction.id,
        "assessment_id": prediction.assessment_id,
        "predicted_class": prediction.predicted_class,
        "probabilities": probabilities,
        "model_version": prediction.model_version,
        "has_heatmap": heatmap_name is not None,
        "disclaimer": "Screening support only, not a diagnosis.",
    }
    if heatmap_name:
        response["heatmap_note"] = HEATMAP_NOTE
    elif heatmap:
        response["heatmap_message"] = "Heatmap not available for this image."
    return response


# ---------------- Images ----------------

@app.get("/images/{image_id}")
def get_image(
    image_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # 1. Image record dhundho
    asset = db.query(models.ImageAsset).filter(models.ImageAsset.id == image_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Image not found")

    # 2. Permission check
    if current_user.role not in ("doctor", "admin"):
        assessment = (
            db.query(models.Assessment)
            .filter(
                models.Assessment.id == asset.assessment_id,
                models.Assessment.user_id == current_user.id,
            )
            .first()
        )
        if not assessment:
            raise HTTPException(status_code=404, detail="Image not found")

    # 3. File disk par hai?
    file_path = UPLOAD_DIR / asset.stored_name
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Image file missing")

    # 4. Image bhejo
    log_action(db, "image_viewed", user_id=current_user.id, detail=f"image_id={asset.id}")
    return FileResponse(file_path, media_type=asset.content_type or "image/jpeg")


@app.post("/images/{image_id}/link")
def create_image_link(
    image_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    asset = db.query(models.ImageAsset).filter(models.ImageAsset.id == image_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Image not found")

    # Patient sirf apni image ka link bana sakta hai
    if current_user.role not in ("doctor", "admin"):
        assessment = (
            db.query(models.Assessment)
            .filter(
                models.Assessment.id == asset.assessment_id,
                models.Assessment.user_id == current_user.id,
            )
            .first()
        )
        if not assessment:
            raise HTTPException(status_code=404, detail="Image not found")

    expire = datetime.now(timezone.utc) + timedelta(minutes=IMAGE_LINK_EXPIRE_MINUTES)
    token = jwt.encode(
        {"type": "image_link", "image_id": asset.id, "uid": current_user.id, "exp": expire},
        SECRET_KEY,
        algorithm=ALGORITHM,
    )
    log_action(db, "image_link_created", user_id=current_user.id, detail=f"image_id={asset.id}")
    return {
        "url": f"/image-links/{token}",
        "expires_in_seconds": IMAGE_LINK_EXPIRE_MINUTES * 60,
    }


@app.get("/image-links/{token}")
def get_image_by_link(token: str, db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Link expired or invalid")

    # Login token se image link nahi khulna chahiye
    if payload.get("type") != "image_link":
        raise HTTPException(status_code=401, detail="Link expired or invalid")

    asset = (
        db.query(models.ImageAsset)
        .filter(models.ImageAsset.id == payload.get("image_id"))
        .first()
    )
    if not asset:
        raise HTTPException(status_code=404, detail="Image not found")

    file_path = UPLOAD_DIR / asset.stored_name
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Image file missing")

    log_action(
        db, "image_viewed_via_link", user_id=payload.get("uid"), detail=f"image_id={asset.id}"
    )
    return FileResponse(
        file_path,
        media_type=asset.content_type or "image/jpeg",
        headers={"Cache-Control": "private, no-store"},
    )


@app.post("/predictions/{prediction_id}/heatmap/link")
def create_heatmap_link(
    prediction_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    pred = get_prediction_for_user(db, prediction_id, current_user)
    if not pred.heatmap_name:
        raise HTTPException(status_code=404, detail="No heatmap for this prediction")

    expire = datetime.now(timezone.utc) + timedelta(minutes=HEATMAP_LINK_EXPIRE_MINUTES)
    token = jwt.encode(
        {"type": "heatmap_link", "prediction_id": pred.id, "uid": current_user.id, "exp": expire},
        SECRET_KEY,
        algorithm=ALGORITHM,
    )
    log_action(db, "heatmap_link_created", user_id=current_user.id, detail=f"prediction_id={pred.id}")
    return {
        "url": f"/heatmap-links/{token}",
        "expires_in_seconds": HEATMAP_LINK_EXPIRE_MINUTES * 60,
        "note": HEATMAP_NOTE,
    }


@app.get("/heatmap-links/{token}")
def get_heatmap_by_link(token: str, db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Link expired or invalid")

    # Login token ya image link se heatmap nahi khulna chahiye
    if payload.get("type") != "heatmap_link":
        raise HTTPException(status_code=401, detail="Link expired or invalid")

    pred = (
        db.query(models.Prediction)
        .filter(models.Prediction.id == payload.get("prediction_id"))
        .first()
    )
    if not pred or not pred.heatmap_name:
        raise HTTPException(status_code=404, detail="Heatmap not found")

    file_path = UPLOAD_DIR / pred.heatmap_name
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Heatmap file missing")

    log_action(
        db, "heatmap_viewed_via_link", user_id=payload.get("uid"), detail=f"prediction_id={pred.id}"
    )
    return FileResponse(
        file_path,
        media_type="image/png",
        headers={"Cache-Control": "private, no-store"},
    )


# ---------------- Doctor ----------------

class ReviewIn(BaseModel):
    comment: str = Field(max_length=2000)
    agrees: bool = True


@app.get("/doctor/assessments")
def doctor_list_assessments(
    db: Session = Depends(get_db),
    doctor: models.User = Depends(require_role("doctor", "admin")),
):
    items = db.query(models.Assessment).all()
    result = []
    for a in items:
        latest = latest_prediction(db, a.id)
        result.append(
            {
                "id": a.id,
                "patient_id": a.user_id,
                "patient_name": a.owner.name,
                "status": a.status,
                "created_at": a.created_at,
                "predicted_class": latest.predicted_class if latest else None,
                "probabilities": json.loads(latest.probabilities) if latest else None,
                "model_version": latest.model_version if latest else None,
                "prediction_id": latest.id if latest else None,
                "has_heatmap": bool(latest and latest.heatmap_name),
            }
        )
    return result


@app.get("/doctor/assessments/{assessment_id}")
def doctor_assessment_detail(
    assessment_id: int,
    db: Session = Depends(get_db),
    doctor: models.User = Depends(require_role("doctor", "admin")),
):
    a = db.query(models.Assessment).filter(models.Assessment.id == assessment_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Assessment not found")

    images = db.query(models.ImageAsset).filter(models.ImageAsset.assessment_id == a.id).all()
    preds = db.query(models.Prediction).filter(models.Prediction.assessment_id == a.id).all()

    result = []
    for p in preds:
        reviews = (
            db.query(models.DoctorReview)
            .filter(models.DoctorReview.prediction_id == p.id)
            .all()
        )
        result.append(
            {
                "id": p.id,
                "predicted_class": p.predicted_class,
                "probabilities": json.loads(p.probabilities),
                "model_version": p.model_version,
                "has_heatmap": p.heatmap_name is not None,
                "reviews": [
                    {
                        "doctor_id": r.doctor_id,
                        "comment": r.comment,
                        "agrees": r.agrees,
                        "created_at": r.created_at,
                    }
                    for r in reviews
                ],
            }
        )

    return {
        "id": a.id,
        "patient_name": a.owner.name,
        "status": a.status,
        "created_at": a.created_at,
        "image_ids": [i.id for i in images],
        "predictions": result,
    }


@app.post("/doctor/predictions/{prediction_id}/review", status_code=201)
def add_review(
    prediction_id: int,
    body: ReviewIn,
    db: Session = Depends(get_db),
    doctor: models.User = Depends(require_role("doctor", "admin")),
):
    pred = db.query(models.Prediction).filter(models.Prediction.id == prediction_id).first()
    if not pred:
        raise HTTPException(status_code=404, detail="Prediction not found")

    review = models.DoctorReview(
        prediction_id=pred.id,
        doctor_id=doctor.id,
        comment=body.comment,
        agrees=body.agrees,
    )
    db.add(review)
    db.commit()
    db.refresh(review)
    log_action(db, "review_added", user_id=doctor.id, detail=f"review_id={review.id}")
    return {
        "id": review.id,
        "prediction_id": review.prediction_id,
        "comment": review.comment,
        "agrees": review.agrees,
    }