"""Shared settings for the AI service (Member 3)."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ARTIFACT_DIR = ROOT / "artifacts"
LOG_DIR = ROOT / "logs"

SEED = 42
IMG_SIZE = (64, 64)                       # same size Member 1 used
CLASSES = ["small", "medium", "large"]    # head circumference classes from Member 1

# Upload safety limits (the backend checks too, the service checks again)
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
ALLOWED_CONTENT_TYPES = {"image/png", "image/jpeg"}
ALLOWED_FORMATS = {"PNG", "JPEG"}
MIN_SIDE = 32
MAX_SIDE = 8000
MAX_IMAGE_PIXELS = 50_000_000

DISCLAIMER = (
    "Screening support only. This is not a diagnosis. "
    "A qualified clinician must review every result."
)
SALIENCY_NOTE = (
    "The map shows which pixels changed the model output the most. "
    "It is not proof of a finding."
)
