// Pure helpers for the Compare page. Probabilities are 0 to 1.

// One row per class: the probability in scan A, in scan B, and the change (B minus A).
export function compareScans(a, b, classes) {
  return classes.map((name) => {
    const pa = a?.probabilities?.[name] ?? 0;
    const pb = b?.probabilities?.[name] ?? 0;
    return { name, a: pa, b: pb, delta: pb - pa };
  });
}

// 0.123 -> "+12 pts", -0.05 -> "-5 pts", 0.001 -> "0 pts"
export function signedPoints(x) {
  const v = Math.round(x * 100);
  return `${v > 0 ? "+" : ""}${v} pts`;
}