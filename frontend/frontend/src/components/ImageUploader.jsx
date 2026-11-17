import { useEffect, useRef, useState } from "react";
import { validateFile, uploadAssessment, MAX_MB } from "../api/client.js";
import { assessQuality, toGray } from "../imageQuality.js";
import { rectFromPoints, clampRect, isUsable, presetBox } from "../redaction.js";
import { redactImage } from "../redactImage.js";

// Measures a small copy of the image and returns advice. Any failure just means no advice.
function checkImage(img) {
  try {
    const scale = Math.min(1, 256 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext("2d", { willReadFrequently: true });
    if (!g) return [];
    g.drawImage(img, 0, 0, w, h);
    const { data } = g.getImageData(0, 0, w, h);
    return assessQuality({ width: img.naturalWidth, height: img.naturalHeight, gray: toGray(data), w, h }).warnings;
  } catch {
    return [];
  }
}

// Lets the user drag black boxes over a name or date burned into the image.
function RedactEditor({ img, boxes, onChange }) {
  const ref = useRef(null);
  const [start, setStart] = useState(null);
  const [now, setNow] = useState(null);
  const W = img.naturalWidth;
  const H = img.naturalHeight;

  useEffect(() => {
    const g = ref.current?.getContext("2d");
    if (!g) return;
    g.drawImage(img, 0, 0);
    g.fillStyle = "#000";
    boxes.forEach((b) => g.fillRect(b.x, b.y, b.w, b.h));
    if (start && now) {
      const r = rectFromPoints(start, now);
      g.fillStyle = "rgba(0, 0, 0, 0.5)";
      g.fillRect(r.x, r.y, r.w, r.h);
      g.strokeStyle = "#fff";
      g.lineWidth = Math.max(2, W / 300);
      g.strokeRect(r.x, r.y, r.w, r.h);
    }
  }, [img, boxes, start, now, W]);

  // Screen position to image pixels, whatever size the canvas is shown at.
  const point = (e) => {
    const r = ref.current.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * W) / r.width, y: ((e.clientY - r.top) * H) / r.height };
  };
  const cancel = () => {
    setStart(null);
    setNow(null);
  };

  return (
    <canvas
      ref={ref}
      width={W}
      height={H}
      className="redact"
      role="img"
      aria-label="Preview with black boxes. Drag across an area to cover it."
      onPointerDown={(e) => {
        ref.current.setPointerCapture?.(e.pointerId);
        const p = point(e);
        setStart(p);
        setNow(p);
      }}
      onPointerMove={(e) => start && setNow(point(e))}
      onPointerUp={(e) => {
        if (!start) return;
        const rect = clampRect(rectFromPoints(start, point(e)), W, H);
        cancel();
        if (isUsable(rect)) onChange([...boxes, rect]);
      }}
      onPointerCancel={cancel}
    />
  );
}

export default function ImageUploader({ onResult }) {
  const input = useRef(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [drag, setDrag] = useState(false);
  const [progress, setProgress] = useState(null); // null = not uploading
  const [imgEl, setImgEl] = useState(null); // the loaded image, for the checks and the blackout tool
  const [advice, setAdvice] = useState([]);
  const [boxes, setBoxes] = useState([]);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  // Load each new image once: run the quality check and clear any boxes from the last one.
  useEffect(() => {
    setImgEl(null);
    setAdvice([]);
    setBoxes([]);
    if (!preview) return undefined;
    let alive = true;
    const img = new Image();
    img.onload = () => {
      if (!alive) return;
      setImgEl(img);
      setAdvice(checkImage(img));
    };
    img.src = preview;
    return () => {
      alive = false;
    };
  }, [preview]);

  const pick = (f) => {
    const err = validateFile(f);
    setError(err);
    if (err) {
      setFile(null);
      setPreview(null);
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const send = async () => {
    setError(null);
    setProgress(0);
    try {
      let toSend = file;
      if (boxes.length > 0) {
        // Never fall back to the original: if the boxes cannot be applied, nothing is uploaded.
        try {
          toSend = await redactImage(imgEl, boxes, file);
        } catch {
          throw new Error("Could not hide the selected areas, so nothing was uploaded. Try again.");
        }
        const problem = validateFile(toSend);
        if (problem) throw new Error(problem);
      }
      const result = await uploadAssessment(toSend, setProgress);
      onResult(result);
      setFile(null);
      setPreview(null);
    } catch (e) {
      setError(e.message); // the file stays selected so the user can retry
    } finally {
      setProgress(null);
    }
  };

  const busy = progress !== null;

  return (
    <section className="panel" aria-labelledby="upload-heading">
      <h2 id="upload-heading">Upload an ultrasound image</h2>

      <div
        className={`drop ${drag ? "over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          pick(e.dataTransfer.files[0]);
        }}
      >
        {preview ? (
          <img src={preview} alt="Preview of the selected ultrasound" className="thumb" />
        ) : (
          <p>Drag an image here, or</p>
        )}

        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png"
          hidden
          onChange={(e) => {
            pick(e.target.files[0]);
            e.target.value = "";
          }}
        />
        <button className="btn ghost" onClick={() => input.current.click()} disabled={busy}>
          {file ? "Choose a different image" : "Choose image"}
        </button>
        <small>JPEG or PNG, up to {MAX_MB} MB. Use anonymised images only.</small>
      </div>

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {file && <p>Selected: {file.name}</p>}

      {advice.length > 0 && (
        <div className="warn" role="status">
          <strong>Image check (advice only, you can still analyse)</strong>
          <ul className="quality-list">
            {advice.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      {file && imgEl && (
        <details className="redact-box">
          <summary>Hide a name or date on the image (optional)</summary>
          <p className="hint">
            Drag across any text burned into the image. The black boxes are drawn into the image before it is
            uploaded, so the covered area is never sent.
          </p>
          <RedactEditor img={imgEl} boxes={boxes} onChange={setBoxes} />
          <div className="row">
            <button
              type="button"
              className="btn ghost sm"
              disabled={busy}
              onClick={() => setBoxes([...boxes, presetBox("top", imgEl.naturalWidth, imgEl.naturalHeight)])}
            >
              Cover top strip
            </button>
            <button
              type="button"
              className="btn ghost sm"
              disabled={busy}
              onClick={() => setBoxes([...boxes, presetBox("bottom", imgEl.naturalWidth, imgEl.naturalHeight)])}
            >
              Cover bottom strip
            </button>
            <button
              type="button"
              className="btn ghost sm"
              disabled={busy || boxes.length === 0}
              onClick={() => setBoxes(boxes.slice(0, -1))}
            >
              Undo
            </button>
            <button
              type="button"
              className="btn ghost sm"
              disabled={busy || boxes.length === 0}
              onClick={() => setBoxes([])}
            >
              Clear
            </button>
          </div>
        </details>
      )}

      {boxes.length > 0 && (
        <p className="hint">
          {boxes.length === 1 ? "1 area will" : `${boxes.length} areas will`} be hidden before upload.
        </p>
      )}

      {busy && (
        <div
          className="bar"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <span style={{ width: `${progress}%` }} />
        </div>
      )}

      <button className="btn" onClick={send} disabled={!file || busy}>
        {busy ? "Analysing…" : "Analyse image"}
      </button>
    </section>
  );
}