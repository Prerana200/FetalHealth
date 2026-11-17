import { useState } from "react";
import { deleteAssessment, DELETE_SUPPORTED } from "../api/client.js";

// A delete button with a confirmation step. It renders nothing when the server cannot delete scans.
export default function DeleteScan({ scanId, onDeleted }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (!DELETE_SUPPORTED) return null;

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteAssessment(scanId);
      onDeleted?.(scanId);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  if (!asking) {
    return (
      <button type="button" className="btn ghost sm no-print" onClick={() => setAsking(true)}>
        Delete scan
      </button>
    );
  }

  return (
    <div className="delete-confirm no-print" role="alertdialog" aria-label="Confirm delete">
      <p>Delete this scan and its result? This cannot be undone.</p>
      <button type="button" className="btn sm danger" onClick={confirm} disabled={busy}>
        {busy ? "Deleting…" : "Yes, delete"}
      </button>{" "}
      <button type="button" className="btn ghost sm" onClick={() => setAsking(false)} disabled={busy}>
        Cancel
      </button>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}
