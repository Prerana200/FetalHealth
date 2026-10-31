import { useEffect, useState } from "react";
import ResultCard from "../components/ResultCard.jsx";
import { listAssessments, saveReview } from "../api/client.js";

export default function DoctorDashboard() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [comment, setComment] = useState("");
  const [message, setMessage] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = () =>
    listAssessments()
      .then(setItems)
      .catch((e) => setMessage(e.message))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const selected = items.find((r) => r.id === selectedId);

  const review = async (agrees) => {
    setSaving(true);
    setMessage(null);
    try {
      await saveReview(selected.id, comment.trim(), agrees);
      setComment("");
      setMessage("Review saved.");
      await load();
    } catch (e) {
      setMessage(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <h1>Review dashboard</h1>
      <div className="split">
        <aside aria-label="Scans">
          {loading ? (
            <p className="empty">Loading scans…</p>
          ) : items.length === 0 ? (
            <p className="empty">No scans to review yet.</p>
          ) : (
            <ul className="list">
              {items.map((r) => (
                <li key={r.id}>
                  <button
                    className={r.id === selectedId ? "sel" : ""}
                    onClick={() => {
                      setSelectedId(r.id);
                      setMessage(null);
                    }}
                  >
                    {r.predicted_class}
                    <small>
                      {new Date(r.created_at).toLocaleString()} · {r.review ? "Reviewed" : "Pending"}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section aria-label="Selected scan">
          {!selected ? (
            <p className="empty">Select a scan to see the image, heatmap and prediction.</p>
          ) : (
            <>
              <ResultCard result={selected} />

              {selected.review && (
                <p className="panel" role="status">
                  <strong>
                    {selected.review.agrees ? "Prediction confirmed" : "Prediction disputed"}.
                  </strong>{" "}
                  {selected.review.comment || "No comment."}
                </p>
              )}

              <label>
                Comment
                <textarea
                  rows="3"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
              </label>
              <div className="row">
                <button className="btn" onClick={() => review(true)} disabled={saving}>
                  Confirm prediction
                </button>
                <button className="btn ghost" onClick={() => review(false)} disabled={saving}>
                  Disagree
                </button>
              </div>
              {message && <p role="status">{message}</p>}
            </>
          )}
        </section>
      </div>
    </>
  );
}