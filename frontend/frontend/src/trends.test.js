import { describe, it, expect } from "vitest";
import { buildSeries, toCoords, summarize } from "./trends.js";

const scan = (id, created_at, conf) => ({
  id,
  created_at,
  predicted_class: "Brain",
  probabilities: { Brain: conf },
});

const box = { width: 600, height: 300, padLeft: 50, padRight: 10, padTop: 10, padBottom: 40 };

describe("buildSeries", () => {
  it("sorts scans oldest first", () => {
    const series = buildSeries([
      scan("new", "2026-03-01T00:00:00Z", 0.9),
      scan("old", "2026-01-01T00:00:00Z", 0.5),
    ]);
    expect(series.map((p) => p.id)).toEqual(["old", "new"]);
  });

  it("does not change the list it was given", () => {
    const list = [scan("b", "2026-02-01T00:00:00Z", 0.9), scan("a", "2026-01-01T00:00:00Z", 0.5)];
    buildSeries(list);
    expect(list[0].id).toBe("b");
  });
});

describe("toCoords", () => {
  it("puts confidence 1 at the top and 0 at the bottom of the plot area", () => {
    const pts = toCoords(buildSeries([scan("a", "2026-01-01", 1), scan("b", "2026-01-02", 0)]), box);
    expect(pts[0].y).toBe(10);
    expect(pts[1].y).toBe(260);
  });

  it("spans the full width for two or more points", () => {
    const pts = toCoords(buildSeries([scan("a", "2026-01-01", 0.5), scan("b", "2026-01-02", 0.5)]), box);
    expect(pts[0].x).toBe(50);
    expect(pts[1].x).toBe(590);
  });

  it("centres a single point", () => {
    const [p] = toCoords(buildSeries([scan("a", "2026-01-01", 0.5)]), box);
    expect(p.x).toBe(320);
  });
});

describe("summarize", () => {
  it("handles an empty series", () => {
    expect(summarize([], 0.6)).toEqual({ count: 0, latest: null, lowCount: 0, change: null });
  });

  it("counts low-confidence scans and the change since the first scan", () => {
    const s = summarize(
      buildSeries([
        scan("a", "2026-01-01", 0.5),
        scan("b", "2026-01-02", 0.55),
        scan("c", "2026-01-03", 0.9),
      ]),
      0.6
    );
    expect(s.count).toBe(3);
    expect(s.lowCount).toBe(2);
    expect(s.latest.id).toBe("c");
    expect(s.change).toBeCloseTo(0.4);
  });

  it("has no change figure for a single scan", () => {
    expect(summarize(buildSeries([scan("a", "2026-01-01", 0.8)]), 0.6).change).toBeNull();
  });
});