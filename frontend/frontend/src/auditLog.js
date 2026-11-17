// Pure helpers for the Audit log page. No imports, so they are easy to unit test.

// Actions the backend records (see API_CONTRACT.md). tone: "ok", "bad", "caution" or "" for neutral.
export const ACTIONS = {
  login_success: { label: "Signed in", tone: "ok" },
  login_failed: { label: "Failed sign-in", tone: "bad" },
  login_blocked_inactive: { label: "Blocked: deactivated account", tone: "bad" },
  image_uploaded: { label: "Image uploaded", tone: "" },
  image_viewed: { label: "Image viewed", tone: "" },
  image_link_created: { label: "Image link created", tone: "" },
  image_viewed_via_link: { label: "Image opened by link", tone: "" },
  prediction_run: { label: "Prediction run", tone: "" },
  review_added: { label: "Review added", tone: "" },
  user_activated: { label: "User activated", tone: "ok" },
  user_deactivated: { label: "User deactivated", tone: "caution" },
};

// Actions the page treats as problems worth a second look.
export const ALERT_ACTIONS = ["login_failed", "login_blocked_inactive"];

// A new action the frontend does not know yet is shown as the raw text.
export const describeAction = (action) => ACTIONS[action] ?? { label: String(action ?? "Unknown"), tone: "" };

// user: exact user id (not a partial match, so "1" does not match "10").
export function filterLogs(list, { action = "", user = "", onlyAlerts = false } = {}) {
  const wanted = user.trim();
  return list.filter((e) => {
    if (action && e.action !== action) return false;
    if (wanted && String(e.user_id ?? "") !== wanted) return false;
    if (onlyAlerts && !ALERT_ACTIONS.includes(e.action)) return false;
    return true;
  });
}

export function summarize(list) {
  const users = new Set();
  let alerts = 0;
  for (const e of list) {
    if (e.user_id != null) users.add(String(e.user_id));
    if (ALERT_ACTIONS.includes(e.action)) alerts += 1;
  }
  return { total: list.length, alerts, users: users.size };
}

// Shown as the server recorded it, because the backend does not say which time zone it uses.
export function formatTime(iso) {
  if (typeof iso !== "string" || iso.length < 19) return "-";
  return iso.slice(0, 19).replace("T", " ");
}

export function detailText(detail) {
  if (detail == null || detail === "") return "-";
  return typeof detail === "string" ? detail : JSON.stringify(detail);
}

// id -> {name, email} so the table can show who a user id is.
export function buildUserLookup(users) {
  return new Map(users.map((u) => [String(u.id), { name: u.name, email: u.email }]));
}