"""Pixel saliency map for the hybrid model (optional heatmap)."""
import base64
import io

import matplotlib
import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image

from config import IMG_SIZE
from preprocessing import image_to_vector

OUT = 256


def saliency_overlay(prep, model, pil_image: Image.Image, px: float, class_index: int):
    """Return the saliency overlay as a base64 PNG."""
    model.eval()
    x = torch.as_tensor(image_to_vector(pil_image), dtype=torch.float32).requires_grad_(True)
    with torch.enable_grad():
        f, q = prep.torch_chain(x, px)
        logits = model(f, q)
        grad = torch.autograd.grad(logits[0, class_index], x)[0]
    sal = grad.abs().reshape(1, 1, IMG_SIZE[1], IMG_SIZE[0])
    sal = F.avg_pool2d(sal, 3, stride=1, padding=1)
    sal = F.interpolate(sal, size=(OUT, OUT), mode="bilinear", align_corners=False)[0, 0].numpy()
    sal = sal / (np.percentile(sal, 99) + 1e-12)
    sal = np.clip(sal, 0, 1)

    base = np.asarray(pil_image.convert("L").resize((OUT, OUT)), dtype=np.float32) / 255.0
    base = np.stack([base] * 3, axis=-1)
    heat = matplotlib.colormaps["jet"](sal)[..., :3].astype(np.float32)
    blend = np.clip(0.55 * base + 0.45 * heat, 0, 1)
    buf = io.BytesIO()
    Image.fromarray((blend * 255).astype(np.uint8)).save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")
