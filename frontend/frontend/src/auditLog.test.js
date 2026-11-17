import { describe, it, expect } from "vitest";
import { describeAction, filterLogs, summarize, formatTime, detailText, buildUserLookup } from "./auditLog.js";

const e = (id, user_id, action, detail = null) => ({ id, user_id, action, detail, created_at: "2026-11-03T06:21:41.240998" });

const LOGS = [
  e(1, 1, "login_success"),
  e(2, null, "login_failed"),
  e(3, 10, "login_blocked_inactive"),
  e(4, 1, "image_uploaded", "image_id=5"),
  e(5, 2, "login_failed"),
];

describe("describeAction", () => {
  it("gives a readable label and tone for known actions", () => {
    expect(describeAction("login_failed")).toEqual({ label: "Failed sign-in", tone: "bad" });
    expect(describeAction("login_success").tone).toBe("ok");
  });

  it("shows an unknown action as its raw text", () => {
    expect(describeAction("something_new")).toEqual({ label: "something_new", tone: "" });
    expect(describeAction(undefined).label).toBe("Unknown");
  });
});

describe("filterLogs", () => {
  it("returns everything when no filter is set", () => {
    expect(filterLogs(LOGS)).toHaveLength(5);
    expect(filterLogs(LOGS, {})).toHaveLength(5);
  });

  it("filters by action", () => {
    expect(filterLogs(LOGS, { action: "login_failed" }).map((x) => x.id)).toEqual([2, 5]);
  });

  it("matches a user id exactly, not partly", () => {
    expect(filterLogs(LOGS, { user: "1" }).map((x) => x.id)).toEqual([1, 4]);
    expect(filterLogs(LOGS, { user: " 10 " }).map((x) => x.id)).toEqual([3]);
  });

  it("keeps only failed or blocked sign-ins when asked", () => {
    expect(filterLogs(LOGS, { onlyAlerts: true }).map((x) => x.id)).toEqual([2, 3, 5]);
  });

  it("combines filters", () => {
    expect(filterLogs(LOGS, { action: "login_failed", user: "2" }).map((x) => x.id)).toEqual([5]);
    expect(filterLogs(LOGS, { action: "image_uploaded", onlyAlerts: true })).toEqual([]);
  });
});

describe("summarize", () => {
  it("counts entries, alerts and different users", () => {
    expect(summarize(LOGS)).toEqual({ total: 5, alerts: 3, users: 3 });
  });

  it("handles an empty list", () => {
    expect(summarize([])).toEqual({ total: 0, alerts: 0, users: 0 });
  });
});

describe("formatTime and detailText", () => {
  it("shows the time as recorded, to the second", () => {
    expect(formatTime("2026-11-03T06:21:41.240998")).toBe("2026-11-03 06:21:41");
  });

  it("shows a dash for missing or short times", () => {
    expect(formatTime(null)).toBe("-");
    expect(formatTime("2026-11-03")).toBe("-");
  });

  it("formats details", () => {
    expect(detailText(null)).toBe("-");
    expect(detailText("")).toBe("-");
    expect(detailText("image_id=5")).toBe("image_id=5");
    expect(detailText({ a: 1 })).toBe('{"a":1}');
  });
});

describe("buildUserLookup", () => {
  it("finds a user by id, whether the id is a number or text", () => {
    const lookup = buildUserLookup([{ id: 1, name: "Riya", email: "riya@gmail.com" }]);
    expect(lookup.get("1")).toEqual({ name: "Riya", email: "riya@gmail.com" });
    expect(lookup.get(String(1))).toBeDefined();
    expect(lookup.get("2")).toBeUndefined();
  });
});