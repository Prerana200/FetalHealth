from contextlib import asynccontextmanager
from pathlib import Path
from io import BytesIO
import logging

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from PIL import Image, UnidentifiedImageError

from inference import HybridUltrasoundClassifier, MODEL_VERSION, DEFAULT_PIXEL_SIZE
from config import (
    MAX_UPLOAD_BYTES,
    ALLOWED_FORMATS,
    MIN_SIDE,
    MAX_SIDE,
    MAX_IMAGE_PIXELS,
    DISCLAIMER,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ai-service")

classifier = None
Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS


@asynccontextmanager
async def lifespan(app: FastAPI):
    global classifier
    classifier = HybridUltrasoundClassifier()
    logger.info("Model loaded: %s", MODEL_VERSION)
    yield
    classifier = None


app = FastAPI(
    title="Hybrid Fetal HC Classification API",
    description="Research prototype for fetal ultrasound head circumference classification.",
    version="1.0.0",
    lifespan=lifespan,
)


@app.get("/health")
def health():
    return {
        "status": "healthy" if classifier else "not_ready",
        "model_loaded": classifier is not None,
        "model_version": MODEL_VERSION,
    }


@app.get("/model-info")
def model_info():
    return {
        "model_name": "PyTorch HybridNet",
        "model_version": MODEL_VERSION,
        "classes": ["Small", "Medium", "Large"],
        "classical_features": 51,
        "quantum_features": 4,
        "quantum_qubits": 4,
        "input_size": [64, 64],
        "default_pixel_size_mm": DEFAULT_PIXEL_SIZE,
        "pixel_size_note": "Default is the training-dataset median; provide image metadata when available.",
        "heatmap": "Optional pixel saliency overlay",
        "disclaimer": DISCLAIMER,
    }


@app.post("/predict")
async def predict(
    file: UploadFile = File(...),
    pixel_size_mm: float = Form(DEFAULT_PIXEL_SIZE),
    include_heatmap: bool = Form(False),
):
    if classifier is None:
        raise HTTPException(status_code=503, detail="Model is not ready.")

    if pixel_size_mm <= 0:
        raise HTTPException(status_code=422, detail="pixel_size_mm must be positive.")

    if file.content_type not in ("image/png", "image/jpeg"):
        raise HTTPException(
            status_code=415,
            detail="Only PNG and JPEG images are supported.",
        )

    try:
        contents = await file.read(MAX_UPLOAD_BYTES + 1)

        if not contents:
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")

        if len(contents) > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail="Image exceeds the 10 MB upload limit.",
            )

        try:
            image = Image.open(BytesIO(contents))

            if image.format not in ALLOWED_FORMATS:
                raise HTTPException(status_code=415, detail="Invalid image format.")

            image.load()

            if (
                image.width < MIN_SIDE
                or image.height < MIN_SIDE
                or image.width > MAX_SIDE
                or image.height > MAX_SIDE
            ):
                raise HTTPException(
                    status_code=422,
                    detail="Image dimensions are outside the allowed range.",
                )

            image = image.convert("RGB")

        except HTTPException:
            raise
        except (
            UnidentifiedImageError,
            Image.DecompressionBombError,
            OSError,
            ValueError,
        ):
            raise HTTPException(
                status_code=400,
                detail="Could not read a valid image.",
            )

        result = classifier.predict(
            image=image,
            pixel_size_mm=pixel_size_mm,
            include_heatmap=include_heatmap,
        )

        logger.info(
            "Prediction completed: version=%s category=%s latency_ms=%.2f",
            MODEL_VERSION,
            result["predicted_category"],
            result["inference_ms"],
        )

        return result

    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception:
        logger.exception("Prediction failed")
        raise HTTPException(
            status_code=500,
            detail="Prediction failed. Check server logs.",
        )
    finally:
        await file.close()
