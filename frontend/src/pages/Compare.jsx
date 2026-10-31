import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listAssessments, CLASSES, LOW_CONFIDENCE } from "../api/client.js";
import { useAuth, roleHome } from "../auth/AuthContext.jsx";
import { confidenceOf } from "../insights.js";
import { compareScans, signedPoints } from "../compare.js";

const pct = (x) => `${Math.round(x * 100)}%`;
const day = (iso) => new Date(iso).toLocaleDateString();
const label = (s) => `${day(s.created_at)} · ${s.predicted_class} (${pct(confidenceOf(s))})`;

function ScanCard({ title, scan }) {
  const conf = confidenceOf(scan);
  return (
    <article className="panel compare-card">
      <h2>{title}</h2>
      {scan.image_url && (
        <img className="result-img" src={scan.image_url} alt={`Ultrasound from ${day(scan.created_at)}, ${scan.predicted_class}`} />
      )}
      <p>
        <strong>{scan.predicted_class}</strong> at {pct(conf)} confidence
        {conf < LOW_CONFIDENCE && <span className="badge warn-badge">Low confidence</span>}
      </p>
      <p className="hint">
        {day(scan.created_at)} ·{" "}
        {scan.review ? (scan.review.agrees ? "Doctor agrees" : "Doctor disagrees") : "Awaiting review"}
      </p>
      <Link to={`/scans/${scan.id}`}>Open this scan</Link>
    </article>
  );
}

export default function Compare() {
  const { user } = useAuth();
  const [list, setList] = useState(null);
  const [error, setError] = useState("");
  const [idA, setIdA] = useState("");
  const [idB, setIdB] = useState("");

  useEffect(() => {
    let alive = true;
    listAssessments()
      .then((data) => {
        if (!alive) return;
        setList(data);
        // The list is newest first: compare the previous scan (A) with the latest (B).
        if (data.length >= 2) {
          setIdA(data[1].id);
          setIdB(data[0].id);
        }
      })
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  const a = list?.find((s) => s.id === idA);
  const b = list?.find((s) => s.id === idB);
  const rows = useMemo(() => (a && b ? compareScans(a, b, CLASSES) : []), [a, b]);

  return (
    <>
      <h1>Compare scans</h1>

      {error && <p className="error" role="alert">{error}</p>}
      {!list && !error && <p className="empty" aria-live="polite">Loading scans...</p>}

      {list && list.length < 2 && (
        <p className="empty">
          You need at least two scans to compare. <Link to={roleHome(user.role)}>Go back</Link>
        </p>
      )}

      {list && list.length >= 2 && (
        <>
          <div className="panel picker">
            <label>
              Scan A (earlier)
              <select value={idA} onChange={(e) => setIdA(e.target.value)}>
                {list.map((s) => (
                  <option key={s.id} value={s.id}>{label(s)}</option>
                ))}
              </select>
            </label>
            <label>
              Scan B (later)
              <select value={idB} onChange={(e) => setIdB(e.target.value)}>
                {list.map((s) => (
                  <option key={s.id} value={s.id}>{label(s)}</option>
                ))}
              </select>
            </label>
          </div>

          {idA === idB && <p className="warn" role="status">You picked the same scan twice. Choose two different scans.</p>}

          {a && b && (
            <>
              <div className="compare-grid">
                <ScanCard title="Scan A" scan={a} />
                <ScanCard title="Scan B" scan={b} />
              </div>

              <div className="table-wrap">
                <table>
                  <caption className="sr-only">Class probabilities in scan A and scan B</caption>
                  <thead>
                    <tr>
                      <th scope="col">Plane</th>
                      <th scope="col" className="num">Scan A</th>
                      <th scope="col" className="num">Scan B</th>
                      <th scope="col" className="num">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.name}>
                        <th scope="row">{r.name}</th>
                        <td className="num">{pct(r.a)}</td>
                        <td className="num">{pct(r.b)}</td>
                        <td className="num">{signedPoints(r.delta)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="hint">
                Change is scan B minus scan A, in percentage points. Different probabilities do not mean the baby's
                condition changed: they show how the model read two different images.
              </p>
            </>
          )}
        </>
      )}
    </>
  );
}