export default function ProbabilityChart({ probabilities, predicted }) {
  const rows = Object.entries(probabilities).sort((a, b) => b[1] - a[1]);
  return (
    <ul className="prob" aria-label="Probability for each plane">
      {rows.map(([name, p]) => (
        <li key={name} className={name === predicted ? "top" : ""}>
          <span>{name}</span>
          <span className="track">
            <span style={{ width: `${p * 100}%` }} />
          </span>
          <span>{(p * 100).toFixed(1)}%</span>
        </li>
      ))}
    </ul>
  );
}