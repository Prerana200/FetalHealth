import { describe, it, expect } from "vitest";
import { describeCategory, HC_CUTS } from "./hcScale.js";

describe("describeCategory", () => {
  it("puts the marker in the middle of each third of the bar", () => {
    expect(describeCategory("Small").left).toBeCloseTo(16.67, 1);
    expect(describeCategory("Medium").left).toBeCloseTo(50, 1);
    expect(describeCategory("Large").left).toBeCloseTo(83.33, 1);
  });

  it("states the millimetre range for each category", () => {
    expect(describeCategory("Small").text).toContain(`${HC_CUTS.lower} mm`);
    expect(describeCategory("Medium").text).toContain(`${HC_CUTS.upper} mm`);
    expect(describeCategory("Large").range).toMatch(/above 172.9 mm/);
  });

  it("shows no marker for an unknown category", () => {
    const d = describeCategory("Brain");
    expect(d.known).toBe(false);
    expect(d.text).toMatch(/not one of Small, Medium or Large/);
  });
});
