import { describe, it, expect } from "vitest";
import { compareScans, signedPoints } from "./compare.js";

const classes = ["Brain", "Femur"];

describe("compareScans", () => {
  it("returns one row per class with the change from A to B", () => {
    const a = { probabilities: { Brain: 0.7, Femur: 0.3 } };
    const b = { probabilities: { Brain: 0.4, Femur: 0.6 } };
    const rows = compareScans(a, b, classes);
    expect(rows.map((r) => r.name)).toEqual(["Brain", "Femur"]);
    expect(rows[0].delta).toBeCloseTo(-0.3);
    expect(rows[1].delta).toBeCloseTo(0.3);
  });

  it("treats missing probabilities as 0", () => {
    const rows = compareScans({}, { probabilities: { Brain: 0.5 } }, classes);
    expect(rows[0]).toMatchObject({ a: 0, b: 0.5 });
    expect(rows[1]).toMatchObject({ a: 0, b: 0, delta: 0 });
  });
});

describe("signedPoints", () => {
  it("adds a plus sign for increases", () => {
    expect(signedPoints(0.123)).toBe("+12 pts");
  });

  it("keeps the minus sign for decreases", () => {
    expect(signedPoints(-0.05)).toBe("-5 pts");
  });

  it("shows 0 pts for tiny changes", () => {
    expect(signedPoints(0.001)).toBe("0 pts");
    expect(signedPoints(-0.001)).toBe("0 pts");
  });
});