"""Member 1's preprocessing, wrapped so training and the service use the same code.

image -> grayscale -> resize 64x64 -> flatten /255 -> StandardScaler
      -> PCA 50 (+ pixel size)  = 51 classical features
      -> PCA 4 -> MinMax to [0, pi] = 4 quantum features
"""
import math

import joblib
import numpy as np
import torch
from PIL import Image

from config import IMG_SIZE


def image_to_vector(img: Image.Image) -> np.ndarray:
    g = img.convert("L").resize(IMG_SIZE)
    return (np.asarray(g, dtype=np.float32).ravel() / 255.0).reshape(1, -1)


def _t(a):
    return torch.as_tensor(np.asarray(a), dtype=torch.float32)


class Preprocessor:
    def __init__(self, path):
        self.scaler, self.pca, self.pca_q, self.mm, self.px_scaler = joblib.load(path)

    def transform_vectors(self, X, px):
        """X has shape (n, 4096), px has n pixel sizes. Returns (F, Q)."""
        Z = self.scaler.transform(X)
        P = self.pca.transform(Z)
        pxs = self.px_scaler.transform(np.asarray(px, dtype=float).reshape(-1, 1))
        F = np.hstack([P, pxs])
        Q = np.clip(self.mm.transform(self.pca_q.transform(Z)), 0.0, np.pi)
        return F.astype(np.float32), Q.astype(np.float32)

    def transform_image(self, img: Image.Image, px: float):
        return self.transform_vectors(image_to_vector(img), [px])

    def torch_chain(self, x: torch.Tensor, px: float):
        """Same maths in torch so gradients can flow back to the pixels."""
        z = (x - _t(self.scaler.mean_)) / _t(self.scaler.scale_)
        p = (z - _t(self.pca.mean_)) @ _t(self.pca.components_).T
        pxv = (float(px) - float(self.px_scaler.mean_[0])) / float(self.px_scaler.scale_[0])
        f = torch.cat([p, torch.full((x.shape[0], 1), pxv, dtype=torch.float32)], dim=1)
        pq = (z - _t(self.pca_q.mean_)) @ _t(self.pca_q.components_).T
        q = torch.clamp(pq * _t(self.mm.scale_) + _t(self.mm.min_), 0.0, math.pi)
        return f, q
