// Advice-only checks on an image before upload. Pure functions: the browser part (drawing the image
// onto a small canvas) lives in the component. The thresholds are starting values, not tuned on real scans.

export const MIN_SIDE = 200; // pixels
export const DARK_MEAN = 15; // average brightness, 0 to 255
export const BRIGHT_MEAN = 200;
export const LOW_STD = 12; // spread of brightness; below this the image is nearly flat
export const BLUR_VARIANCE = 15; // variance of the Laplacian; below this the image has almost no fine detail

// Brightness (0 to 255) of each pixel in RGBA data.
export function toGray(rgba) {
  const out = new Uint8Array(rgba.length / 4);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 1) {
    out[j] = Math.round(0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]);
  }
  return out;
}

export function measure(gray, w, h) {
  const n = gray.length;
  let sum = 0;
  for (let i = 0; i < n; i += 1) sum += gray[i];
  const mean = n ? sum / n : 0;

  let sq = 0;
  for (let i = 0; i < n; i += 1) sq += (gray[i] - mean) ** 2;
  const std = n ? Math.sqrt(sq / n) : 0;

  // Variance of the Laplacian over interior pixels: a common sharpness measure.
  let lSum = 0;
  let lSq = 0;
  let count = 0;
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const i = y * w + x;
      const lap = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w];
      lSum += lap;
      lSq += lap * lap;
      count += 1;
    }
  }
  const lMean = count ? lSum / count : 0;
  const sharpness = count ? lSq / count - lMean * lMean : 0;

  return { mean, std, sharpness };
}

// width and height are the original image size; gray, w and h describe the small copy that was measured.
export function assessQuality({ width, height, gray, w, h }) {
  const metrics = measure(gray, w, h);
  const warnings = [];

  if (Math.min(width, height) < MIN_SIDE) {
    warnings.push(`This image is small (${width} x ${height} pixels). Larger images usually give more reliable results.`);
  }

  const tonal = [];
  if (metrics.mean < DARK_MEAN) {
    tonal.push("This image is almost completely dark. Check that it is the right image.");
  } else if (metrics.mean > BRIGHT_MEAN) {
    tonal.push("This image is very bright. Check that it is the right image.");
  } else if (metrics.std < LOW_STD) {
    tonal.push("This image has very little contrast. It may be blank or the wrong image.");
  }
  warnings.push(...tonal);

  // A blank or very dark image is also "not sharp", so only mention blur when nothing else is wrong.
  if (!tonal.length && metrics.sharpness < BLUR_VARIANCE) {
    warnings.push("This image may be blurry. A sharper image usually gives a clearer result.");
  }

  return { metrics, warnings };
}