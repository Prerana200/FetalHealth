import { useCallback, useEffect, useMemo, useState } from "react";
import { listAuditLogs, listUsers } from "../api/client.js";
import {
  ACTIONS,
  describeAction,
  filterLogs,
  summarize,
  formatTime,
  detailText,
  buildUserLookup,
} from "../auditLog.js";

export default function AuditLog() {
  const [logs, setLogs] = useState(null);
  const [users, setUsers] = useState(new Map());
  const [error, setError] = useState("");
  const [action, setAction] = useState("");
  const [user, setUser] = useState("");
  const [onlyAlerts, setOnlyAlerts] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      setLogs(await listAuditLogs());
    } catch (e) {
      setError(e.message);
    }
    // Names are a nice extra. The log still works without them.
    try {
      setUsers(buildUserLookup(await listUsers()));
    } catch {
      setUsers(new Map());
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const shown = useMemo(() => (logs ? filterLogs(logs, { action, user, onlyAlerts }) : []), [logs, action, user, onlyAlerts]);
  const stats = useMemo(() => summarize(shown), [shown]);

  // Offer every action the backend knows, plus any new one that appears in the data.
  const actionOptions = useMemo(() => {
    const seen = new Set(Object.keys(ACTIONS));
    (logs ?? []).forEach((e) => seen.add(e.action));
    return [...seen];
  }, [logs]);

  return (
    <>
      <div className="page-head">
        <h1>Audit log</h1>
        <button className="btn ghost" onClick={load}>
          Refresh
        </button>
      </div>
      <p className="hint">The latest 100 entries, newest first. Times are shown as the server recorded them.</p>

      {error && <p className="error" role="alert">{error}</p>}
      {!logs && !error && <p className="empty" aria-live="polite">Loading the audit log...</p>}

      {logs && (
        <>
          <div className="stats">
            <div className="stat">
              <span className="num">{stats.total}</span>
              <span className="label">Entries shown</span>
            </div>
            <div className={`stat${stats.alerts > 0 ? " alert" : ""}`}>
              <span className="num">{stats.alerts}</span>
              <span className="label">Failed or blocked sign-ins</span>
            </div>
            <div className="stat">
              <span className="num">{stats.users}</span>
              <span className="label">Different users</span>
            </div>
          </div>

          <div className="panel filters">
            <label>
              Action
              <select value={action} onChange={(e) => setAction(e.target.value)}>
                <option value="">All actions</option>
                {actionOptions.map((a) => (
                  <option key={a} value={a}>{describeAction(a).label}</option>
                ))}
              </select>
            </label>
            <label>
              User id
              <input value={user} onChange={(e) => setUser(e.target.value)} placeholder="For example 1" />
            </label>
            <label className="check">
              <input type="checkbox" checked={onlyAlerts} onChange={(e) => setOnlyAlerts(e.target.checked)} />
              Only failed or blocked sign-ins
            </label>
          </div>

          {logs.length === 0 && <p className="empty">The audit log is empty.</p>}
          {logs.length > 0 && shown.length === 0 && <p className="empty">No entries match these filters.</p>}

          {shown.length > 0 && (
            <div className="table-wrap">
              <table>
                <caption className="sr-only">Audit log entries, newest first</caption>
                <thead>
                  <tr>
                    <th scope="col">Time</th>
                    <th scope="col">User</th>
                    <th scope="col">Action</th>
                    <th scope="col">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((e) => {
                    const info = describeAction(e.action);
                    const who = users.get(String(e.user_id));
                    return (
                      <tr key={e.id}>
                        <td>{formatTime(e.created_at)}</td>
                        <td>
                          {e.user_id == null ? (
                            <span className="muted">Unknown</span>
                          ) : (
                            <>
                              {who ? who.name : `User ${e.user_id}`} <small className="muted">#{e.user_id}</small>
                            </>
                          )}
                        </td>
                        <td>
                          <span className={`badge${info.tone ? ` ${info.tone}` : ""}`}>{info.label}</span>
                        </td>
                        <td>{detailText(e.detail)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}