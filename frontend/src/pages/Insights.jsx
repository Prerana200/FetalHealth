import { useEffect, useMemo, useState } from "react";
import { listAssessments, CLASSES, LOW_CONFIDENCE } from "../api/client.js";
import { computeStats, toCsv } from "../insights.js";

const pct = (x) => `${Math.round(x * 100)}%`;

function downloadCsv(list) {
  const url = URL.createObjectURL(new Blob([toCsv(list)], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `scans-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Insights() {
  const [list, setList] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    listAssessments()
      .then((data) => alive && setList(data))
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  const stats = useMemo(
    () => (list ? computeStats(list, { classes: CLASSES, lowThreshold: LOW_CONFIDENCE }) : null),
    [list]
  );

  return (
    <>
      <div className="page-head">
        <h1>Insights</h1>
        {list && list.length > 0 && (
          <button className="btn ghost" onClick={() => downloadCsv(list)}>
            Export CSV
          </button>
        )}
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      {!list && !error && <p className="empty" aria-live="polite">Loading scans...</p>}

      {stats && stats.total === 0 && <p className="empty">No scans yet. Insights appear once scans are uploaded.</p>}

      {stats && stats.total > 0 && (
        <>
          <div className="stats">
            <div className="stat">
              <span className="num">{stats.total}</span>
              <span className="label">Total scans</span>
            </div>
            <div className="stat">
              <span className="num">{stats.pending}</span>
              <span className="label">Awaiting review</span>
            </div>
            <div className={`stat${stats.low > 0 ? " alert" : ""}`}>
              <span className="num">{stats.low}</span>
              <span className="label">Low confidence (below {pct(LOW_CONFIDENCE)})</span>
            </div>
            <div className="stat">
              <span className="num">{pct(stats.avgConfidence)}</span>
              <span className="label">Average confidence</span>
            </div>
            <div className="stat">
              <span className="num">{stats.agreementRate === null ? "n/a" : pct(stats.agreementRate)}</span>
              <span className="label">Doctor agreement ({stats.reviewed} reviewed)</span>
            </div>
          </div>

          <section className="panel" aria-labelledby="dist-h">
            <h2 id="dist-h">Scans by plane</h2>
            <ul className="dist">
              {CLASSES.map((c) => (
                <li key={c}>
                  <span>{c}</span>
                  <span className="track" role="img" aria-label={`${c}: ${stats.byClass[c]} of ${stats.total}`}>
                    <span style={{ width: `${(stats.byClass[c] / stats.total) * 100}%` }} />
                  </span>
                  <span className="count">{stats.byClass[c]}</span>
                </li>
              ))}
            </ul>
          </section>

          <p className="hint">
            Agreement is the share of reviewed scans where the doctor confirmed the model's prediction. These figures
            describe usage, not clinical accuracy.
          </p>
        </>
      )}
    </>
  );
}