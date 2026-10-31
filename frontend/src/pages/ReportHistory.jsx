import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listAssessments, CLASSES, LOW_CONFIDENCE } from "../api/client.js";

const confidence = (r) => r.probabilities[r.predicted_class];

const sorters = {
  newest: (a, b) => new Date(b.created_at) - new Date(a.created_at),
  oldest: (a, b) => new Date(a.created_at) - new Date(b.created_at),
  lowest: (a, b) => confidence(a) - confidence(b),
};

function status(r) {
  if (!r.review) return { text: "Awaiting review", cls: "" };
  return r.review.agrees
    ? { text: "Confirmed by doctor", cls: "ok" }
    : { text: "Disputed by doctor", cls: "bad" };
}

export default function ReportHistory() {
  const [items, setItems] = useState(null); // null while loading
  const [error, setError] = useState(null);
  const [cls, setCls] = useState("all");
  const [state, setState] = useState("all");
  const [sort, setSort] = useState("newest");

  useEffect(() => {
    listAssessments()
      .then(setItems)
      .catch((e) => {
        setError(e.message);
        setItems([]);
      });
  }, []);

  const shown = useMemo(() => {
    let list = items ?? [];
    if (cls !== "all") list = list.filter((r) => r.predicted_class === cls);
    if (state === "pending") list = list.filter((r) => !r.review);
    if (state === "reviewed") list = list.filter((r) => r.review);
    return [...list].sort(sorters[sort]);
  }, [items, cls, state, sort]);

  return (
    <>
      <h1>Report history</h1>

      <div className="filters">
        <label>
          Plane
          <select value={cls} onChange={(e) => setCls(e.target.value)}>
            <option value="all">All planes</option>
            {CLASSES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Review status
          <select value={state} onChange={(e) => setState(e.target.value)}>
            <option value="all">All</option>
            <option value="pending">Awaiting review</option>
            <option value="reviewed">Reviewed</option>
          </select>
        </label>
        <label>
          Sort by
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="lowest">Lowest confidence</option>
          </select>
        </label>
      </div>

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      {items === null ? (
        <p className="empty">Loading reports…</p>
      ) : items.length === 0 ? (
        <p className="empty">
          No reports yet. <Link to="/patient">Upload your first scan</Link>.
        </p>
      ) : shown.length === 0 ? (
        <p className="empty">No reports match these filters.</p>
      ) : (
        <>
          <p className="empty">
            Showing {shown.length} of {items.length} reports
          </p>
          <ul className="rows">
            {shown.map((r) => {
              const s = status(r);
              const low = confidence(r) < LOW_CONFIDENCE;
              return (
                <li key={r.id} className="hist-item">
                  <img src={r.image_url} alt="" />
                  <div>
                    <strong>{r.predicted_class}</strong>{" "}
                    <small className="muted">{(confidence(r) * 100).toFixed(0)}% confidence</small>
                    {low && <span className="badge warn-badge">Low confidence</span>}
                    <br />
                    <time>{new Date(r.created_at).toLocaleString()}</time>
                    <br />
                    <span className={`badge ${s.cls}`}>{s.text}</span>
                  </div>
                  <Link to={`/scans/${r.id}`}>View report</Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}