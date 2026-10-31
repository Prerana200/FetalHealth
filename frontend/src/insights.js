// Pure helpers for the Insights page. No imports, so they are easy to unit test.

export const confidenceOf = (a) => a?.probabilities?.[a?.predicted_class] ?? 0;

// classes: array of class names. lowThreshold: confidence below this counts as low (0 to 1).
export function computeStats(list, { classes, lowThreshold }) {
  const byClass = Object.fromEntries(classes.map((c) => [c, 0]));
  let low = 0;
  let reviewed = 0;
  let agreed = 0;
  let sum = 0;

  for (const a of list) {
    if (a.predicted_class in byClass) byClass[a.predicted_class] += 1;
    const c = confidenceOf(a);
    sum += c;
    if (c < lowThreshold) low += 1;
    if (a.review) {
      reviewed += 1;
      if (a.review.agrees) agreed += 1;
    }
  }

  const total = list.length;
  return {
    total,
    byClass,
    low,
    reviewed,
    agreed,
    pending: total - reviewed,
    avgConfidence: total ? sum / total : 0,
    agreementRate: reviewed ? agreed / reviewed : null,
  };
}

// Quote a CSV cell. A leading = + - @ is prefixed with ' so spreadsheets don't run it as a formula.
function cell(value) {
  let s = String(value ?? "");
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(list) {
  const head = ["id", "created_at", "predicted_class", "confidence_percent", "reviewed", "doctor_agrees", "comment"];
  const rows = list.map((a) => [
    a.id,
    a.created_at,
    a.predicted_class,
    Math.round(confidenceOf(a) * 100),
    a.review ? "yes" : "no",
    a.review ? (a.review.agrees ? "yes" : "no") : "",
    a.review?.comment ?? "",
  ]);
  return [head, ...rows].map((r) => r.map(cell).join(",")).join("\n");
}