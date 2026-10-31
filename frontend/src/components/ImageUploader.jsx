import { useEffect, useRef, useState } from "react";
import { validateFile, uploadAssessment, MAX_MB } from "../api/client.js";

export default function ImageUploader({ onResult }) {
  const input = useRef(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [drag, setDrag] = useState(false);
  const [progress, setProgress] = useState(null); // null = not uploading

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
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
      const result = await uploadAssessment(file, setProgress);
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