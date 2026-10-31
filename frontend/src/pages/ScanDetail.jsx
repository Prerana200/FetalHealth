import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import ResultCard from "../components/ResultCard.jsx";
import { getAssessment } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.jsx";

export default function ScanDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [scan, setScan] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setScan(null);
    setError(null);
    getAssessment(id)
      .then(setScan)
      .catch((e) => setError(e.message));
  }, [id]);

  const back = user.role === "patient" ? "/history" : "/doctor";

  return (
    <>
      <p className="no-print">
        <Link to={back}>← Back</Link>
      </p>
      <h1>Scan report</h1>

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!scan && !error && <p className="empty">Loading report…</p>}

      {scan && (
        <>
          <p>
            <time>{new Date(scan.created_at).toLocaleString()}</time>
            <br />
            <small className="muted">Report ID: {scan.id}</small>
          </p>

          <ResultCard result={scan} />

          <section className="panel" aria-label="Doctor review">
            <h2>Doctor review</h2>
            {scan.review ? (
              <p>
                <strong>
                  {scan.review.agrees ? "Prediction confirmed" : "Prediction disputed"}.
                </strong>{" "}
                {scan.review.comment || "No comment."}
              </p>
            ) : (
              <p className="empty">Not reviewed yet.</p>
            )}
          </section>

          <button className="btn no-print" onClick={() => window.print()}>
            Print / save as PDF
          </button>
        </>
      )}
    </>
  );
}