import { describe, it, expect } from "vitest";
import { rectFromPoints, clampRect, isUsable, presetBox } from "./redaction.js";

describe("rectFromPoints", () => {
  it("gives the same rectangle whichever corner the drag started from", () => {
    const a = { x: 10, y: 20 };
    const b = { x: 30, y: 5 };
    expect(rectFromPoints(a, b)).toEqual({ x: 10, y: 5, w: 20, h: 15 });
    expect(rectFromPoints(b, a)).toEqual({ x: 10, y: 5, w: 20, h: 15 });
  });
});

describe("clampRect", () => {
  it("leaves a rectangle inside the image unchanged", () => {
    expect(clampRect({ x: 5, y: 5, w: 20, h: 10 }, 100, 100)).toEqual({ x: 5, y: 5, w: 20, h: 10 });
  });

  it("trims a rectangle that runs past the edges", () => {
    expect(clampRect({ x: -10, y: 90, w: 30, h: 30 }, 100, 100)).toEqual({ x: 0, y: 90, w: 20, h: 10 });
  });

  it("gives an empty rectangle when it is fully outside", () => {
    const r = clampRect({ x: 200, y: 200, w: 10, h: 10 }, 100, 100);
    expect(r).toEqual({ x: 100, y: 100, w: 0, h: 0 });
    expect(isUsable(r)).toBe(false);
  });

  it("rounds to whole pixels", () => {
    expect(clampRect({ x: 1.4, y: 1.6, w: 10.2, h: 10.2 }, 100, 100)).toEqual({ x: 1, y: 2, w: 11, h: 10 });
  });
});

describe("isUsable", () => {
  it("ignores tiny accidental drags", () => {
    expect(isUsable({ x: 0, y: 0, w: 3, h: 50 })).toBe(false);
    expect(isUsable({ x: 0, y: 0, w: 50, h: 3 })).toBe(false);
    expect(isUsable({ x: 0, y: 0, w: 4, h: 4 })).toBe(true);
  });
});

describe("presetBox", () => {
  it("covers a strip across the top", () => {
    expect(presetBox("top", 1000, 500)).toEqual({ x: 0, y: 0, w: 1000, h: 60 });
  });

  it("covers a strip across the bottom", () => {
    expect(presetBox("bottom", 1000, 500)).toEqual({ x: 0, y: 440, w: 1000, h: 60 });
  });
});