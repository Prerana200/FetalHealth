import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listAssessments, LOW_CONFIDENCE } from "../api/client.js";
import { buildSeries, toCoords, summarize } from "../trends.js";
import { signedPoints } from "../compare.js";

const pct = (x) => `${Math.round(x * 100)}%`;
const day = (iso) => new Date(iso).toLocaleDateString();

const BOX = { width: 640, height: 280, padLeft: 46, padRight: 16, padTop: 14, padBottom: 34 };
const GRID = [0, 0.25, 0.5, 0.75, 1];
const yAt = (v) => BOX.padTop + (1 - v) * (BOX.height - BOX.padTop - BOX.padBottom);

export default function Trends() {
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

  const series = useMemo(() => (list ? buildSeries(list) : []), [list]);
  const points = useMemo(() => toCoords(series, BOX), [series]);
  const stats = useMemo(() => summarize(series, LOW_CONFIDENCE), [series]);

  return (
    <>
      <h1>Your trends</h1>

      {error && <p className="error" role="alert">{error}</p>}
      {!list && !error && <p className="empty" aria-live="polite">Loading scans...</p>}

      {list && list.length === 0 && (
        <p className="empty">
          No scans yet. <Link to="/patient">Upload your first scan</Link> to see trends.
        </p>
      )}

      {stats.count > 0 && (
        <>
          <div className="stats">
            <div className="stat">
              <span className="num">{stats.count}</span>
              <span className="label">Scans</span>
            </div>
            <div className="stat">
              <span className="num">{pct(stats.latest.confidence)}</span>
              <span className="label">Latest confidence ({stats.latest.plane})</span>
            </div>
            <div className="stat">
              <span className="num">{stats.change === null ? "n/a" : signedPoints(stats.change)}</span>
              <span className="label">Change since first scan</span>
            </div>
            <div className={`stat${stats.lowCount > 0 ? " alert" : ""}`}>
              <span className="num">{stats.lowCount}</span>
              <span className="label">Low-confidence scans</span>
            </div>
          </div>

          <section className="panel" aria-labelledby="trend-h">
            <h2 id="trend-h">Model confidence per scan</h2>
            <svg
              className="chart"
              viewBox={`0 0 ${BOX.width} ${BOX.height}`}
              role="img"
              aria-label={`Line chart of model confidence across ${stats.count} scans. Latest is ${pct(stats.latest.confidence)}.`}
            >
              {GRID.map((v) => (
                <g key={v}>
                  <line className="grid" x1={BOX.padLeft} x2={BOX.width - BOX.padRight} y1={yAt(v)} y2={yAt(v)} />
                  <text className="axis" x={BOX.padLeft - 8} y={yAt(v) + 4} textAnchor="end">
                    {Math.round(v * 100)}%
                  </text>
                </g>
              ))}
              <line className="limit" x1={BOX.padLeft} x2={BOX.width - BOX.padRight} y1={yAt(LOW_CONFIDENCE)} y2={yAt(LOW_CONFIDENCE)} />
              <text className="axis limit-label" x={BOX.width - BOX.padRight} y={yAt(LOW_CONFIDENCE) - 5} textAnchor="end">
                Low-confidence limit
              </text>

              {points.length > 1 && (
                <polyline className="line" points={points.map((p) => `${p.x},${p.y}`).join(" ")} />
              )}
              {points.map((p) => (
                <circle key={p.id} className={`dot${p.confidence < LOW_CONFIDENCE ? " low" : ""}`} cx={p.x} cy={p.y} r="5">
                  <title>{`${day(p.date)}: ${p.plane}, ${pct(p.confidence)}`}</title>
                </circle>
              ))}

              <text className="axis" x={BOX.padLeft} y={BOX.height - 10} textAnchor="start">
                {day(series[0].date)}
              </text>
              {series.length > 1 && (
                <text className="axis" x={BOX.width - BOX.padRight} y={BOX.height - 10} textAnchor="end">
                  {day(series[series.length - 1].date)}
                </text>
              )}
            </svg>
            <p className="hint">
              Each dot is one scan, oldest on the left. A higher figure means the model favoured its answer more
              strongly. It does not measure the health of a pregnancy.
            </p>
          </section>

          <details className="panel data-table">
            <summary>View the data as a table</summary>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Plane</th>
                    <th scope="col" className="num">Confidence</th>
                    <th scope="col"><span className="sr-only">Link</span></th>
                  </tr>
                </thead>
                <tbody>
                  {[...series].reverse().map((p) => (
                    <tr key={p.id}>
                      <td>{day(p.date)}</td>
                      <td>{p.plane}</td>
                      <td className="num">{pct(p.confidence)}</td>
                      <td><Link to={`/scans/${p.id}`}>Open</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </>
  );
}