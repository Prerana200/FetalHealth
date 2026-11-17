import { describe, it, expect } from "vitest";
import { toGray, measure, assessQuality } from "./imageQuality.js";

// Builds a grey image of w x h pixels from a function of (x, y).
const make = (w, h, fn) => Uint8Array.from({ length: w * h }, (_, i) => fn(i % w, Math.floor(i / w)));
const flat = (w, h, v) => make(w, h, () => v);
const checker = (w, h) => make(w, h, (x, y) => ((x + y) % 2) * 255);

describe("toGray", () => {
  it("converts RGBA pixels to brightness", () => {
    const rgba = Uint8ClampedArray.of(255, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255);
    expect(Array.from(toGray(rgba))).toEqual([76, 255, 0]);
  });
});

describe("measure", () => {
  it("finds no spread and no detail in a flat image", () => {
    const m = measure(flat(8, 8, 100), 8, 8);
    expect(m.mean).toBeCloseTo(100);
    expect(m.std).toBeCloseTo(0);
    expect(m.sharpness).toBeCloseTo(0);
  });

  it("finds a lot of spread and detail in a checkerboard", () => {
    const m = measure(checker(8, 8), 8, 8);
    expect(m.mean).toBeCloseTo(127.5);
    expect(m.std).toBeCloseTo(127.5);
    expect(m.sharpness).toBeGreaterThan(1000);
  });
});

describe("assessQuality", () => {
  const run = (gray, w, h, width = 800, height = 600) => assessQuality({ width, height, gray, w, h }).warnings;

  it("gives no advice for a normal, detailed image", () => {
    expect(run(checker(16, 16), 16, 16)).toEqual([]);
  });

  it("flags an almost black image once, without also calling it blurry", () => {
    const w = run(flat(10, 10, 0), 10, 10);
    expect(w).toHaveLength(1);
    expect(w[0]).toMatch(/dark/i);
  });

  it("flags a very bright image", () => {
    expect(run(flat(10, 10, 250), 10, 10)[0]).toMatch(/bright/i);
  });

  it("flags a flat mid-grey image as low contrast", () => {
    const w = run(flat(10, 10, 100), 10, 10);
    expect(w).toHaveLength(1);
    expect(w[0]).toMatch(/contrast/i);
  });

  it("flags a small image", () => {
    const w = run(checker(8, 8), 8, 8, 100, 300);
    expect(w).toHaveLength(1);
    expect(w[0]).toMatch(/small/i);
    expect(w[0]).toContain("100 x 300");
  });

  it("flags a smooth image with no fine detail as possibly blurry", () => {
    const ramp = make(16, 16, (x) => x * 17);
    const w = run(ramp, 16, 16);
    expect(w).toHaveLength(1);
    expect(w[0]).toMatch(/blurry/i);
  });
});