import { useEffect, useState } from "react";
import ImageUploader from "../components/ImageUploader.jsx";
import ResultCard from "../components/ResultCard.jsx";
import { listAssessments } from "../api/client.js";

export default function PatientPortal() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    listAssessments()
      .then(setItems)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <>
      <h1>My scans</h1>
      <ImageUploader onResult={(r) => setItems((prev) => [r, ...prev])} />

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      <section aria-labelledby="history-heading">
        <h2 id="history-heading">Results</h2>
        {items.length === 0 ? (
          <p className="empty">No scans yet. Upload an image above to see your first result.</p>
        ) : (
          items.map((r) => (
            <div key={r.id}>
              <time>{new Date(r.created_at).toLocaleString()}</time>
              <ResultCard result={r} />
            </div>
          ))
        )}
      </section>
    </>
  );
}