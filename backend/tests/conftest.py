import base64
import io
import os

# Test ke liye alag secret (asli .env ko touch nahi karta)
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-pytest-only-0123456789")

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import main
import models


def tiny_png_b64():
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), "red").save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


def fake_ai(image_bytes, filename, content_type, include_heatmap=False):
    """Nakli AI service: real service call nahi hoti tests mein."""
    return {
        "predicted_class": "Brain",
        "probabilities": {
            "Brain": 0.82, "Abdomen": 0.05, "Femur": 0.03,
            "Thorax": 0.04, "Cervix": 0.02, "Other": 0.04,
        },
        "model_version": "test-v1",
        "heatmap_base64": tiny_png_b64() if include_heatmap else None,
    }


@pytest.fixture()
def db_session_factory():
    # Har test ko apni nayi, khali, in-memory database milti hai (asli app.db safe rehti hai)
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    models.Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False)


@pytest.fixture()
def client(db_session_factory, tmp_path, monkeypatch):
    def override_get_db():
        db = db_session_factory()
        try:
            yield db
        finally:
            db.close()

    main.app.dependency_overrides[main.get_db] = override_get_db
    monkeypatch.setattr(main, "UPLOAD_DIR", tmp_path)          # images temp folder mein
    monkeypatch.setattr(main, "call_ai_service", fake_ai)      # AI service nakli
    main.limiter.enabled = False                               # rate limit band (ek test mein on karenge)
    yield TestClient(main.app)
    main.app.dependency_overrides.clear()
    main.limiter.enabled = False


@pytest.fixture()
def make_user(client, db_session_factory):
    """User banao, role set karo, login karo, auth headers wapas do."""

    def _make(email, role="patient", password="password123"):
        r = client.post(
            "/register",
            json={"name": email.split("@")[0], "email": email, "password": password},
        )
        assert r.status_code == 201, r.text
        if role != "patient":
            db = db_session_factory()
            user = db.query(models.User).filter(models.User.email == email).first()
            user.role = role
            db.commit()
            db.close()
        r = client.post("/login", data={"username": email, "password": password})
        assert r.status_code == 200, r.text
        return {"Authorization": f"Bearer {r.json()['access_token']}"}

    return _make


def _image_bytes(fmt):
    buf = io.BytesIO()
    Image.new("RGB", (20, 20), "red").save(buf, format=fmt)
    return buf.getvalue()


@pytest.fixture()
def jpeg_bytes():
    return _image_bytes("JPEG")


@pytest.fixture()
def gif_bytes():
    return _image_bytes("GIF")


@pytest.fixture()
def patient_with_image(client, make_user, jpeg_bytes):
    headers = make_user("aman@gmail.com")
    aid = client.post("/assessments", headers=headers).json()["id"]
    r = client.post(
        f"/assessments/{aid}/image",
        files={"file": ("scan.jpg", jpeg_bytes, "image/jpeg")},
        headers=headers,
    )
    assert r.status_code == 201, r.text
    return {"headers": headers, "assessment_id": aid, "image_id": r.json()["id"]}