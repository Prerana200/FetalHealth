import { describe, it, expect } from "vitest";
import {
  validateFile,
  MAX_MB,
  CLASSES,
  login,
  register,
  googleLogin,
  listAssessments,
  getAssessment,
  uploadAssessment,
} from "./client.js";

// Builds a fake file with the type and size we want to test.
const file = (type, size, name = "scan") => {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
};

describe("validateFile", () => {
  it("asks for a file when none is given", () => {
    expect(validateFile(undefined)).toMatch(/choose an ultrasound image/i);
  });
  it("rejects an empty file", () => {
    expect(validateFile(file("image/png", 0))).toMatch(/empty/i);
  });
  it("rejects unsupported formats", () => {
    expect(validateFile(file("application/pdf", 1000))).toMatch(/unsupported format/i);
    expect(validateFile(file("image/gif", 1000))).toMatch(/unsupported format/i);
  });
  it("rejects files over the size limit", () => {
    expect(validateFile(file("image/jpeg", (MAX_MB + 1) * 1024 * 1024))).toMatch(/larger than/i);
  });
  it("accepts JPEG and PNG within the limit", () => {
    expect(validateFile(file("image/jpeg", 1000))).toBeNull();
    expect(validateFile(file("image/png", MAX_MB * 1024 * 1024))).toBeNull();
  });
});

describe("mock sign-in", () => {
  it("requires an email and password", async () => {
    await expect(login("", "x")).rejects.toThrow(/enter your email and password/i);
  });
  it("picks the role from the email", async () => {
    expect((await login("anna@example.com", "x")).user.role).toBe("patient");
    expect((await login("doctor.lee@example.com", "x")).user.role).toBe("doctor");
    expect((await login("admin@example.com", "x")).user.role).toBe("admin");
  });
  it("always registers new users as patients", async () => {
    expect((await register("Anna", "anna@example.com", "password1")).user.role).toBe("patient");
  });
  it("signs Google users in as patients", async () => {
    expect((await googleLogin("token")).user.role).toBe("patient");
  });
});

describe("mock scans", () => {
  it("starts with sample history, newest first", async () => {
    const list = await listAssessments();
    expect(list.length).toBeGreaterThanOrEqual(6);
    expect(new Date(list[0].created_at) > new Date(list[list.length - 1].created_at)).toBe(true);
  });
  it("gives every sample a full set of probabilities that add up to 1", async () => {
    for (const r of await listAssessments()) {
      expect(Object.keys(r.probabilities).sort()).toEqual([...CLASSES].sort());
      const sum = Object.values(r.probabilities).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 5);
    }
  });
  it("finds a scan by id and rejects an unknown id", async () => {
    const [first] = await listAssessments();
    expect((await getAssessment(first.id)).id).toBe(first.id);
    await expect(getAssessment("nope")).rejects.toThrow(/could not be found/i);
  });
  it("adds an uploaded scan to the top of the history", async () => {
    const progress = [];
    const result = await uploadAssessment(file("image/png", 1000, "a.png"), (p) => progress.push(p));
    expect(progress.at(-1)).toBe(100);
    expect((await listAssessments())[0].id).toBe(result.id);
  });
});