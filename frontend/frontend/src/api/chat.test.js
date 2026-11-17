import { describe, it, expect } from "vitest";
import { chat, listAssessments } from "./client.js";

const ask = async (text, scanId) =>
  (await chat([{ role: "user", content: text }], scanId)).reply;

describe("mock chatbot rules", () => {
  it("points to emergency help for urgent symptoms", async () => {
    expect(await ask("I have heavy bleeding")).toMatch(/emergency services/i);
  });
  it("refuses to diagnose", async () => {
    expect(await ask("Is my baby healthy?")).toMatch(/can't diagnose/i);
  });
  it("explains the heatmap without calling it a finding", async () => {
    expect(await ask("What is a heatmap?")).toMatch(/isn't evidence/i);
  });
  it("uses the scan when explaining confidence", async () => {
    const [scan] = await listAssessments();
    expect(await ask("What does my confidence mean?", scan.id)).toContain(scan.predicted_class);
  });
  it("explains the head-size categories with the training cut-points", async () => {
    expect(await ask("What does Medium mean?")).toMatch(/131.2 to 172.9 mm/);
  });
  it("falls back to what it can help with", async () => {
    expect(await ask("hello")).toMatch(/upload a scan/i);
  });
});