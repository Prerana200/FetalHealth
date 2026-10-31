export default function SafetyNote({ version }) {
  return (
    <p className="safety" role="note">
      Screening support only, not a diagnosis. A clinician must confirm every result.
      {version && <> Model version {version}.</>}
    </p>
  );
}