// Pure helpers for the Trends page. Confidence values are 0 to 1.
import { confidenceOf } from "./insights.js";

// Oldest scan first, with just the fields the chart needs.
export function buildSeries(list) {
  return [...list]
    .sort((x, y) => new Date(x.created_at) - new Date(y.created_at))
    .map((s) => ({
      id: s.id,
      date: s.created_at,
      plane: s.predicted_class,
      confidence: confidenceOf(s),
    }));
}

// Maps a series to SVG coordinates. Points are spaced evenly left to right;
// confidence 1 sits at the top of the plot area and 0 at the bottom.
export function toCoords(series, { width, height, padLeft, padRight, padTop, padBottom }) {
  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;
  return series.map((p, i) => ({
    ...p,
    x: padLeft + (series.length === 1 ? innerW / 2 : (i / (series.length - 1)) * innerW),
    y: padTop + (1 - p.confidence) * innerH,
  }));
}

export function summarize(series, lowThreshold) {
  if (series.length === 0) return { count: 0, latest: null, lowCount: 0, change: null };
  const first = series[0];
  const latest = series[series.length - 1];
  return {
    count: series.length,
    latest,
    lowCount: series.filter((p) => p.confidence < lowThreshold).length,
    change: series.length > 1 ? latest.confidence - first.confidence : null,
  };
}