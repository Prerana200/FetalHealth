from pathlib import Path
import time

import numpy as np
import torch

from preprocessing import Preprocessor
from hybrid_model import HybridNet
from explain import saliency_overlay


BASE_DIR = Path(__file__).resolve().parent

CLASS_NAMES = ["Small", "Medium", "Large"]
MODEL_VERSION = "hybrid-fetal-hc-v1.0.0"
DEFAULT_PIXEL_SIZE = 0.128357242315

DEVICE = torch.device("cpu")


class HybridUltrasoundClassifier:

    def __init__(self):

        self.preprocessor = Preprocessor(
            BASE_DIR / "preprocessors.joblib"
        )

        checkpoint = torch.load(
            BASE_DIR / "hybrid.pt",
            map_location=DEVICE,
            weights_only=True
        )

        self.model = HybridNet(
            f_mean=checkpoint["f_mean"].numpy(),
            f_std=checkpoint["f_std"].numpy(),
            qw_init=checkpoint["q.weights"].numpy(),
            n_classes=3,
            hidden=checkpoint["classical.0.weight"].shape[0]
        )

        self.model.load_state_dict(checkpoint)
        self.model.to(DEVICE)
        self.model.eval()

    def predict(
        self,
        image,
        pixel_size_mm=DEFAULT_PIXEL_SIZE,
        include_heatmap=False
    ):

        if image is None:
            raise ValueError("Please provide an ultrasound image.")

        if pixel_size_mm is None or float(pixel_size_mm) <= 0:
            raise ValueError("Pixel size must be positive.")

        start_time = time.perf_counter()

        # Same preprocessing used during model training
        F, Q = self.preprocessor.transform_image(
            image,
            float(pixel_size_mm)
        )

        f_tensor = torch.as_tensor(
            F, dtype=torch.float32, device=DEVICE
        )

        q_tensor = torch.as_tensor(
            Q, dtype=torch.float32, device=DEVICE
        )

        # Prediction
        with torch.no_grad():
            logits = self.model(f_tensor, q_tensor)
            scores = torch.softmax(logits, dim=1).cpu().numpy()[0]

        predicted_index = int(np.argmax(scores))

        result = {
            "predicted_category": CLASS_NAMES[predicted_index],
            "model_scores": {
                name: float(score)
                for name, score in zip(CLASS_NAMES, scores)
            },
            "model_version": MODEL_VERSION,
            "pixel_size_mm": float(pixel_size_mm),
            "inference_ms": round(
                (time.perf_counter() - start_time) * 1000, 2
            ),
            "heatmap_base64": None,
            "heatmap_message": None,
            "disclaimer": (
                "Research screening support only. "
                "Not a medical diagnosis."
            )
        }

        if include_heatmap:
            try:
                heatmap = saliency_overlay(
                    self.preprocessor,
                    self.model,
                    image,
                    float(pixel_size_mm),
                    predicted_index
                )

                result["heatmap_base64"] = heatmap
                result["heatmap_message"] = (
                    "Pixel saliency overlay generated successfully. "
                    "It is not proof of a medical finding."
                )

            except Exception as exc:
                result["heatmap_message"] = (
                    f"Heatmap generation unavailable: {str(exc)}"
                )

        return result
