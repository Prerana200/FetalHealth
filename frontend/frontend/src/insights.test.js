import { describe, it, expect } from "vitest";
import { computeStats, toCsv, confidenceOf } from "./insights.js";

const opts = { classes: ["Brain", "Femur", "Other"], lowThreshold: 0.6 };

const scan = (cls, conf, review = null) => ({
  id: `${cls}-${conf}`,
  created_at: "2026-01-01T00:00:00Z",
  predicted_class: cls,
  probabilities: { [cls]: conf },
  review,
});

describe("computeStats", () => {
  it("returns zeros and a null agreement rate for an empty list", () => {
    const s = computeStats([], opts);
    expect(s.total).toBe(0);
    expect(s.avgConfidence).toBe(0);
    expect(s.agreementRate).toBeNull();
    expect(s.byClass).toEqual({ Brain: 0, Femur: 0, Other: 0 });
  });

  it("counts classes, low confidence, reviews and agreement", () => {
    const list = [
      scan("Brain", 0.9, { comment: "ok", agrees: true }),
      scan("Brain", 0.5),
      scan("Femur", 0.8, { comment: "no", agrees: false }),
    ];
    const s = computeStats(list, opts);
    expect(s.total).toBe(3);
    expect(s.byClass).toEqual({ Brain: 2, Femur: 1, Other: 0 });
    expect(s.low).toBe(1);
    expect(s.reviewed).toBe(2);
    expect(s.pending).toBe(1);
    expect(s.agreementRate).toBe(0.5);
    expect(s.avgConfidence).toBeCloseTo((0.9 + 0.5 + 0.8) / 3);
  });

  it("ignores classes it does not know about", () => {
    const s = computeStats([scan("Mystery", 0.9)], opts);
    expect(s.total).toBe(1);
    expect(s.byClass).toEqual({ Brain: 0, Femur: 0, Other: 0 });
  });
});

describe("confidenceOf", () => {
  it("is 0 when probabilities are missing", () => {
    expect(confidenceOf({ predicted_class: "Brain" })).toBe(0);
  });
});

describe("toCsv", () => {
  it("writes a header and one row per scan", () => {
    const lines = toCsv([scan("Brain", 0.9)]).split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("predicted_class");
    expect(lines[1]).toContain("Brain");
    expect(lines[1]).toContain("90");
  });

  it("quotes commas and doubled quotes in comments", () => {
    const csv = toCsv([scan("Brain", 0.9, { comment: 'Looks "fine", agree', agrees: true })]);
    expect(csv).toContain('"Looks ""fine"", agree"');
  });

  it("neutralises spreadsheet formulas", () => {
    const csv = toCsv([scan("Brain", 0.9, { comment: "=HYPERLINK(1)", agrees: true })]);
    expect(csv).toContain("'=HYPERLINK(1)");
  });
});