export const MAX_MB = 10;
export const ALLOWED = ["image/jpeg", "image/png"];
export const CLASSES = ["Small", "Medium", "Large"]; // head-size categories, in the order the AI service uses
export const ROLES = ["patient", "doctor", "admin"];
export const LOW_CONFIDENCE = 0.6; // below this, the UI shows a warning

// true = fake data in the browser, false = talk to the real backend.
const MOCK = import.meta.env.VITE_USE_MOCK === "true";

// The backend has no delete endpoint yet, so deleting only works on the sample data.
export const DELETE_SUPPORTED = MOCK;

// Returns an error message, or null if the file is fine.
export function validateFile(file) {
  if (!file) return "Choose an ultrasound image to upload.";
  if (file.size === 0) return "This file is empty. Choose a different image.";
  if (!ALLOWED.includes(file.type)) return "Unsupported format. Upload a JPEG or PNG image.";
  if (file.size > MAX_MB * 1024 * 1024) return `This file is larger than ${MAX_MB} MB. Upload a smaller image.`;
  return null;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ---------- Mock data ---------- */

function mockHeatmap() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const g = canvas.getContext("2d");
  if (!g) return null;
  const grad = g.createRadialGradient(70, 56, 4, 70, 56, 52);
  grad.addColorStop(0, "rgba(255,60,0,.85)");
  grad.addColorStop(0.5, "rgba(255,190,0,.45)");
  grad.addColorStop(1, "rgba(255,190,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return canvas.toDataURL("image/png");
}

// A grey placeholder "ultrasound" for the sample history entries.
function mockImage() {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 220;
  const g = canvas.getContext("2d");
  if (!g) return "";
  g.fillStyle = "#050505";
  g.fillRect(0, 0, 320, 220);
  const grad = g.createRadialGradient(160, 110, 10, 160, 110, 110);
  grad.addColorStop(0, "#9aa4a8");
  grad.addColorStop(1, "#050505");
  g.fillStyle = grad;
  g.beginPath();
  g.ellipse(160, 110, 100, 85, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#cfd8dc";
  g.font = "14px sans-serif";
  g.fillText("Sample scan", 12, 22);
  return canvas.toDataURL("image/png");
}

// strength = how strongly the chosen class wins. Low strength gives a low-confidence result.
function makeMock(image_url, forced, created_at = new Date().toISOString(), strength = 4) {
  const raw = CLASSES.map(() => Math.random() ** 3);
  const win = forced ? CLASSES.indexOf(forced) : Math.floor(Math.random() * CLASSES.length);
  raw[win] += strength;
  const sum = raw.reduce((a, b) => a + b, 0);
  const probabilities = {};
  CLASSES.forEach((name, i) => {
    probabilities[name] = raw[i] / sum;
  });
  const predicted_class = CLASSES.reduce((a, b) => (probabilities[a] > probabilities[b] ? a : b));
  return {
    id: crypto.randomUUID(),
    created_at,
    predicted_class,
    probabilities,
    model_version: "mock-0.1",
    image_url,
    has_heatmap: true,
    heatmap_url: mockHeatmap(),
    review: null,
  };
}

// Six sample past scans so the history page has something to show.
const DAY = 86400000;
const mockStore = [
  ["Medium", 1, 4],
  ["Large", 3, 1],
  ["Small", 6, 4],
  ["Large", 12, 4],
  ["Medium", 20, 1],
  ["Small", 40, 4],
].map(([cls, days, strength], i) => {
  const r = makeMock(mockImage(), cls, new Date(Date.now() - days * DAY).toISOString(), strength);
  if (i % 3 === 2) r.review = { comment: "Looks correct.", agrees: true };
  return r;
});

// Mock user list for the admin panel. Mock sign-in checks it, so deactivated users cannot sign in.
const mockUsers = [
  { id: "admin@example.com", name: "admin", email: "admin@example.com", role: "admin", active: true },
  { id: "doctor.lee@example.com", name: "doctor.lee", email: "doctor.lee@example.com", role: "doctor", active: true },
  { id: "doctor.rao@example.com", name: "doctor.rao", email: "doctor.rao@example.com", role: "doctor", active: true },
  { id: "anna@example.com", name: "anna", email: "anna@example.com", role: "patient", active: true },
  { id: "ravi@example.com", name: "ravi", email: "ravi@example.com", role: "patient", active: false },
];

/* ---------- Backend connection ---------- */

// In dev, Vite proxies /api to the backend and strips the prefix (see vite.config.js).
// For a deployed build, set VITE_API_BASE to the backend's full address.
const API = import.meta.env.VITE_API_BASE ?? "/api";
const JSON_HEADERS = { "Content-Type": "application/json" };

let token = null;
let unauthorizedHandler = () => {};
export const setToken = (t) => {
  token = t;
};
export const onUnauthorized = (fn) => {
  unauthorizedHandler = fn;
  return () => {
    unauthorizedHandler = () => {};
  };
};

// fetch() that adds the token and signs the user out on 401. Paths have no /api prefix.
async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { ...options, headers });
  if (res.status === 401) unauthorizedHandler();
  return res;
}

// The backend's error format is { detail: "message" }. Use it when it is plain text.
async function detailOf(res, fallback) {
  try {
    const body = await res.json();
    if (typeof body.detail === "string" && body.detail) return body.detail;
  } catch {
    /* not JSON */
  }
  return fallback;
}

// The role comes from GET /me. It is cached per token so it is asked for once.
let roleCache = { token: null, role: null };
async function currentRole() {
  if (roleCache.token === token && roleCache.role) return roleCache.role;
  const res = await request("/me");
  if (!res.ok) throw new Error("Could not check your account. Sign in again.");
  const me = await res.json();
  roleCache = { token, role: me.role };
  return me.role;
}

/* ---------- Backend data to frontend shape ---------- */

// The backend has no "agrees" field on reviews yet, so it is kept as a prefix on the comment.
const AGREE_TAG = "[agrees] ";
const DISAGREE_TAG = "[disagrees] ";

function parseReview(r) {
  if (!r) return null;
  const text = r.comment ?? "";
  if (text.startsWith(DISAGREE_TAG)) return { comment: text.slice(DISAGREE_TAG.length), agrees: false };
  if (text.startsWith(AGREE_TAG)) return { comment: text.slice(AGREE_TAG.length), agrees: true };
  // A comment written outside this app has no tag and is shown as a confirmation.
  return { comment: text, agrees: true };
}

const latestBy = (items, key) => items.reduce((a, b) => (b[key] > a[key] ? b : a), items[0]);
const newestId = (ids) => (ids?.length ? Math.max(...ids) : null);

// Only asks for a heatmap link when the latest prediction has one.
async function heatmapFor(detail) {
  const preds = detail.predictions ?? [];
  const pred = preds.length ? latestBy(preds, "id") : null;
  return pred?.has_heatmap ? heatmapUrl(pred.id) : null;
}

async function imageUrl(imageId) {
  if (imageId == null) return "";
  const res = await request(`/images/${imageId}/link`, { method: "POST" });
  if (!res.ok) return "";
  const { url } = await res.json();
  return `${API}${url}`; // temporary link, valid for 5 minutes
}

// POST /predictions/:id/heatmap/link gives a temporary PNG link (valid for 5 minutes), like image links.
async function heatmapUrl(predictionId) {
  if (predictionId == null) return null;
  const res = await request(`/predictions/${predictionId}/heatmap/link`, { method: "POST" });
  if (!res.ok) return null;
  const { url } = await res.json();
  return `${API}${url}`;
}

function toAssessment(detail, url, heatmap = null) {
  const preds = detail.predictions ?? [];
  const pred = preds.length ? latestBy(preds, "id") : null;
  const review = pred?.reviews?.length ? latestBy(pred.reviews, "created_at") : null;
  return {
    id: detail.id,
    created_at: detail.created_at,
    patient_name: detail.patient_name,
    predicted_class: pred?.predicted_class ?? null,
    probabilities: pred?.probabilities ?? {},
    model_version: pred?.model_version ?? "",
    prediction_id: pred?.id ?? null,
    image_url: url,
    has_heatmap: Boolean(pred?.has_heatmap),
    heatmap_url: heatmap,
    review: parseReview(review),
  };
}

const basePath = (role) => (role === "patient" ? "/assessments" : "/doctor/assessments");

// The list endpoints give only a summary, so each scan is fetched in full.
async function hydrate(role, summary) {
  const res = await request(`${basePath(role)}/${summary.id}`);
  if (!res.ok) return null;
  const detail = await res.json();
  const url = await imageUrl(newestId(detail.image_ids));
  const full = { created_at: summary.created_at, patient_name: summary.patient_name, ...detail };
  return toAssessment(full, url, await heatmapFor(full));
}

/* ---------- API functions ---------- */

// POST /login (form data, email in the "username" field), then GET /me for the name and role.
export async function login(email, password) {
  if (MOCK) {
    await wait(300);
    if (!email || !password) throw new Error("Enter your email and password.");
    const known = mockUsers.find((u) => u.email === email);
    if (known && !known.active) throw new Error("This account has been deactivated.");
    const role =
      known?.role ??
      (email.includes("admin") ? "admin" : email.includes("doctor") ? "doctor" : "patient");
    return { access_token: "mock-token", user: { id: email, name: email.split("@")[0], role } };
  }
  const res = await fetch(`${API}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username: email, password }),
  });
  if (res.status === 401) throw new Error("Email or password is incorrect.");
  if (res.status === 403) throw new Error("This account has been deactivated.");
  if (res.status === 429) throw new Error("Too many attempts. Wait a minute and try again.");
  if (!res.ok) throw new Error("Could not sign in. Try again.");
  const { access_token } = await res.json();

  const meRes = await fetch(`${API}/me`, { headers: { Authorization: `Bearer ${access_token}` } });
  if (!meRes.ok) throw new Error("Could not sign in. Try again.");
  const me = await meRes.json();
  roleCache = { token: access_token, role: me.role };
  return { access_token, user: { id: me.id, name: me.name, role: me.role } };
}

// POST /register (JSON). It returns no token, so the new user is signed in straight afterwards.
export async function register(name, email, password) {
  if (MOCK) {
    await wait(300);
    return { access_token: "mock-token", user: { id: `u${Date.now()}`, name, role: "patient" } };
  }
  const res = await fetch(`${API}/register`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ name, email, password }),
  });
  if (res.status === 400) throw new Error("An account with this email already exists.");
  if (res.status === 422) {
    throw new Error("Check your details. The password needs 8 to 72 characters and the email must be valid.");
  }
  if (res.status === 429) throw new Error("Too many attempts. Wait a minute and try again.");
  if (!res.ok) throw new Error("Could not create the account. Try again.");
  return login(email, password);
}

// Google sign-in is parked on the backend until the Firebase setup is agreed.
export async function googleLogin(credential) {
  if (MOCK) {
    await wait(300);
    return { access_token: "mock-token", user: { id: "g1", name: "Google User", role: "patient" } };
  }
  void credential;
  throw new Error("Google sign-in is not available yet. Use your email and password.");
}

// Real mode: POST /assessments, POST /assessments/:id/image, then POST /assessments/:id/predict.
export function uploadAssessment(file, onProgress) {
  if (MOCK) {
    return (async () => {
      for (let p = 0; p <= 100; p += 20) {
        onProgress?.(p);
        await wait(150);
      }
      await wait(500);
      // About one in four mock uploads is low-confidence, so you can see the warning.
      const strength = Math.random() < 0.25 ? 1 : 4;
      const result = makeMock(URL.createObjectURL(file), null, undefined, strength);
      mockStore.unshift(result);
      return result;
    })();
  }
  return (async () => {
    const created = await request("/assessments", { method: "POST" });
    if (!created.ok) throw new Error(await detailOf(created, "Could not start the scan. Try again."));
    const assessment = await created.json();

    await sendImage(assessment.id, file, onProgress);

    // heatmap=true asks the AI service for a pixel-saliency map. If it can't make one, the result still saves.
    const predicted = await request(`/assessments/${assessment.id}/predict?heatmap=true`, { method: "POST" });
    if (predicted.status === 503) throw new Error("The analysis service is unavailable. Try again in a moment.");
    if (!predicted.ok) throw new Error(await detailOf(predicted, "The analysis failed. Try again."));
    const p = await predicted.json();
    const heatmap = p.has_heatmap ? await heatmapUrl(p.id) : null;

    return {
      id: assessment.id,
      created_at: assessment.created_at,
      predicted_class: p.predicted_class,
      probabilities: p.probabilities,
      model_version: p.model_version,
      prediction_id: p.id,
      image_url: URL.createObjectURL(file),
      has_heatmap: Boolean(heatmap),
      heatmap_url: heatmap,
      heatmap_message: p.heatmap_message ?? null,
      review: null,
    };
  })();
}

// XMLHttpRequest instead of fetch because fetch can't report upload progress.
function sendImage(assessmentId, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append("file", file);
    xhr.open("POST", `${API}/assessments/${assessmentId}/image`);
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status === 401) unauthorizedHandler();
      if (xhr.status < 300) return resolve(JSON.parse(xhr.responseText));
      const messages = {
        400: "The server could not read this image. Try a different file.",
        404: "This scan could not be found. Start again.",
        413: "The server rejected the file as too large.",
        415: "The server does not accept this file type.",
      };
      reject(new Error(messages[xhr.status] || "The upload failed. Try again."));
    };
    xhr.onerror = () => reject(new Error("Network error. Check your connection and try again."));
    xhr.send(form);
  });
}

// Patients: GET /assessments. Doctors and admins: GET /doctor/assessments. Newest first.
export async function listAssessments() {
  if (MOCK) {
    await wait(200);
    return [...mockStore];
  }
  const role = await currentRole();
  const res = await request(basePath(role));
  if (!res.ok) throw new Error("Could not load scans.");
  const summaries = (await res.json()).filter((s) => s.status === "completed");
  const full = await Promise.all(summaries.map((s) => hydrate(role, s)));
  return full
    .filter((a) => a && a.predicted_class)
    .sort((x, y) => String(y.created_at).localeCompare(String(x.created_at)));
}

// GET /assessments/:id (patients) or GET /doctor/assessments/:id (doctors and admins).
export async function getAssessment(id) {
  if (MOCK) {
    await wait(150);
    const item = mockStore.find((r) => r.id === id);
    if (!item) throw new Error("This scan could not be found.");
    return item;
  }
  const role = await currentRole();
  const res = await request(`${basePath(role)}/${id}`);
  if (res.status === 404) throw new Error("This scan could not be found.");
  if (!res.ok) throw new Error("Could not load this scan.");
  const detail = await res.json();

  // The doctor detail has no created_at, so take it from the doctor list.
  let created_at = detail.created_at;
  if (!created_at && role !== "patient") {
    const listRes = await request("/doctor/assessments");
    if (listRes.ok) {
      const row = (await listRes.json()).find((s) => String(s.id) === String(id));
      created_at = row?.created_at;
    }
  }

  const withDate = { ...detail, created_at };
  const scan = toAssessment(withDate, await imageUrl(newestId(detail.image_ids)), await heatmapFor(withDate));
  if (!scan.predicted_class) throw new Error("This scan has not been analysed yet.");
  return scan;
}

// Deleting works on the sample data only. The backend contract has no delete endpoint yet.
export async function deleteAssessment(id) {
  if (!MOCK) throw new Error("Deleting scans is not supported by the server yet.");
  await wait(250);
  const i = mockStore.findIndex((r) => r.id === id);
  if (i === -1) throw new Error("This scan could not be found.");
  mockStore.splice(i, 1);
}

// POST /doctor/predictions/:prediction_id/review. The backend reviews a prediction, not a scan.
export async function saveReview(id, comment, agrees) {
  if (MOCK) {
    await wait(300);
    const item = mockStore.find((r) => r.id === id);
    if (!item) throw new Error("This scan could not be found.");
    item.review = { comment, agrees };
    return;
  }
  const res = await request(`/doctor/assessments/${id}`);
  if (!res.ok) throw new Error("This scan could not be found.");
  const preds = (await res.json()).predictions ?? [];
  if (!preds.length) throw new Error("This scan has no prediction to review yet.");

  const tagged = `${agrees ? AGREE_TAG : DISAGREE_TAG}${comment}`;
  const post = await request(`/doctor/predictions/${latestBy(preds, "id").id}/review`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ comment: tagged }),
  });
  if (!post.ok) throw new Error(await detailOf(post, "Could not save the review."));
}

/* ---------- AI chatbot ---------- */

export const CHAT_MAX_CHARS = 500;
export const CHAT_HISTORY = 10; // only the latest messages are sent to the backend

const EMERGENCY =
  "If you have severe pain, heavy bleeding, leaking fluid, a fever, or the baby is moving much less than usual, contact your doctor or local emergency services now. I can't assess symptoms.";

// Simple rules standing in for the real AI in mock mode.
function mockReply(text, scan) {
  const t = text.toLowerCase();
  if (/(pain|bleed|emergenc|urgent|leak|fever|movement|contraction)/.test(t)) return EMERGENCY;
  if (/(diagnos|is my baby|is it normal|healthy|risk|safe)/.test(t)) {
    return "I can't diagnose or say whether a pregnancy is healthy. This tool only sorts a fetal head ultrasound image into a size group (Small, Medium or Large), and a clinician must interpret it. Please ask your doctor about your scan.";
  }
  if (/heatmap|saliency/.test(t)) {
    return "The heatmap is a pixel-saliency map. It highlights the pixels that changed the model's output the most. It isn't evidence of a finding, and it can highlight areas that aren't medically important.";
  }
  if (/(confidence|score|percent|%|probab)/.test(t)) {
    if (scan) {
      const pct = Math.round(scan.probabilities[scan.predicted_class] * 100);
      return `Your scan was placed in the ${scan.predicted_class} group with a model score of ${pct}%. ${
        pct < LOW_CONFIDENCE * 100
          ? "That is below 60%, so a clearer image or a clinician's check is a good idea."
          : "A higher score means the model favoured that group more strongly, but it is not a measure of medical certainty and a clinician still has to confirm it."
      }`;
    }
    return "The model score shows how strongly the model favours its top group. It is not a calibrated probability or a measure of medical certainty. Below 60% the app shows a low-score warning, which means a clearer image or a clinician's check is a good idea.";
  }
  if (/(categor|group|class|small|medium|large|head|circumference|hc)/.test(t)) {
    return "The categories Small, Medium and Large are groups of fetal head circumference (HC) values from the training data: Small is below 131.2 mm, Medium is 131.2 to 172.9 mm, and Large is above 172.9 mm. They are experimental groups, not clinical growth standards.";
  }
  if (/(upload|image|format|size|jpeg|png)/.test(t)) {
    return "You can upload a JPEG or PNG up to 10 MB. Use anonymised images only, then press Analyse image.";
  }
  return "I can explain how to upload a scan, what the head-size categories and model score mean, and how heatmaps work. I can't give medical advice.";
}

// The backend has no chat endpoint yet, so real mode uses the same rule-based answers.
export async function chat(messages, scanId = null) {
  const recent = messages.slice(-CHAT_HISTORY).map(({ role, content }) => ({ role, content }));
  const last = recent.at(-1)?.content ?? "";
  if (MOCK) {
    await wait(400);
    const scan = scanId ? mockStore.find((r) => r.id === scanId) : null;
    return { reply: mockReply(last, scan) };
  }
  await wait(200);
  return { reply: mockReply(last, null) };
}

/* ---------- Admin ---------- */

// GET /admin/users -> [{id, name, email, role, is_active}], mapped to {..., active}
export async function listUsers() {
  if (MOCK) {
    await wait(200);
    return mockUsers.map((u) => ({ ...u }));
  }
  const res = await request("/admin/users");
  if (!res.ok) throw new Error("Could not load users.");
  return (await res.json()).map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    active: u.is_active,
  }));
}

export async function createUser({ name, email, password, role }) {
  if (MOCK) {
    await wait(300);
    if (mockUsers.some((u) => u.email === email)) {
      throw new Error("An account with this email already exists.");
    }
    const u = { id: email, name, email, role, active: true };
    mockUsers.push(u);
    return { ...u };
  }
  const res = await request("/admin/users", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ name, email, password, role }),
  });
  if (res.status === 400) throw new Error("An account with this email already exists.");
  if (res.status === 403) throw new Error("Only admins can create users.");
  if (res.status === 422) {
    throw new Error("Check the details. The password needs 8 to 72 characters and the email must be valid.");
  }
  if (!res.ok) throw new Error("Could not create the user.");
  const u = await res.json();
  return { id: u.id, name: u.name, email: u.email, role: u.role, active: u.is_active };
}

// PUT /admin/users/:id/role {role} and PUT /admin/users/:id/active {is_active}.
export async function updateUser(id, changes) {
  if (MOCK) {
    await wait(250);
    const u = mockUsers.find((x) => x.id === id);
    if (!u) throw new Error("This user could not be found.");
    Object.assign(u, changes);
    return { ...u };
  }
  const put = (suffix, body) =>
    request(`/admin/users/${encodeURIComponent(id)}/${suffix}`, {
      method: "PUT",
      headers: JSON_HEADERS,
      body: JSON.stringify(body),
    });

  if ("role" in changes) {
    const res = await put("role", { role: changes.role });
    if (res.status === 400) throw new Error("You can't change your own role.");
    if (res.status === 404) throw new Error("This user could not be found.");
    if (!res.ok) throw new Error("Could not change the role.");
  }
  if ("active" in changes) {
    const res = await put("active", { is_active: changes.active });
    if (res.status === 400) throw new Error("You can't change your own status.");
    if (res.status === 404) throw new Error("This user could not be found.");
    if (!res.ok) throw new Error("Could not update the user.");
  }
  const all = await listUsers();
  return all.find((u) => String(u.id) === String(id)) ?? { id, ...changes };
}

// Sample entries for mock mode: [user id, action, detail, minutes ago]. Newest first.
const MIN = 60000;
const mockAudit = [
  ["admin@example.com", "user_deactivated", "user_id=ravi@example.com", 5],
  ["admin@example.com", "login_success", null, 8],
  [null, "login_failed", null, 20],
  [null, "login_failed", null, 21],
  ["ravi@example.com", "login_blocked_inactive", null, 45],
  ["doctor.lee@example.com", "review_added", "prediction_id=7", 60],
  ["doctor.lee@example.com", "image_viewed", "image_id=5", 62],
  ["doctor.lee@example.com", "login_success", null, 65],
  ["anna@example.com", "prediction_run", "assessment_id=3", 120],
  ["anna@example.com", "image_uploaded", "image_id=5", 125],
  ["anna@example.com", "login_success", null, 130],
].map(([user_id, action, detail, mins], i) => ({
  id: 100 - i,
  user_id,
  action,
  detail,
  created_at: new Date(Date.now() - mins * MIN).toISOString(),
}));

// GET /admin/audit-logs -> latest 100 entries, newest first: [{id, user_id, action, detail, created_at}]
export async function listAuditLogs() {
  if (MOCK) {
    await wait(200);
    return mockAudit.map((e) => ({ ...e }));
  }
  const res = await request("/admin/audit-logs");
  if (res.status === 403) throw new Error("Only admins can view the audit log.");
  if (!res.ok) throw new Error("Could not load the audit log.");
  return res.json();
}