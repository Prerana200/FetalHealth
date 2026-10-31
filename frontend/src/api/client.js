export const MAX_MB = 10;
export const ALLOWED = ["image/jpeg", "image/png"];
export const CLASSES = ["Abdomen", "Brain", "Femur", "Thorax", "Cervix", "Other"];
export const LOW_CONFIDENCE = 0.6; // below this, the UI shows a warning

// true = fake data in the browser, false = talk to the real backend.
const MOCK = import.meta.env.VITE_USE_MOCK === "true";

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
    heatmap_url: mockHeatmap(),
    review: null,
  };
}

// Six sample past scans so the history page has something to show.
const DAY = 86400000;
const mockStore = [
  ["Brain", 1, 4],
  ["Femur", 3, 1],
  ["Abdomen", 6, 4],
  ["Thorax", 12, 4],
  ["Brain", 20, 1],
  ["Cervix", 40, 4],
].map(([cls, days, strength], i) => {
  const r = makeMock(mockImage(), cls, new Date(Date.now() - days * DAY).toISOString(), strength);
  if (i % 3 === 2) r.review = { comment: "Looks correct.", agrees: true };
  return r;
});

/* ---------- Auth token ---------- */

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

// fetch() that adds the token and signs the user out on 401.
async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, { ...options, headers });
  if (res.status === 401) unauthorizedHandler();
  return res;
}

/* ---------- API functions ---------- */

// POST /api/auth/login {email, password} -> { access_token, user: {id, name, role} }
export async function login(email, password) {
  if (MOCK) {
    await wait(300);
    if (!email || !password) throw new Error("Enter your email and password.");
    const role = email.includes("admin") ? "admin" : email.includes("doctor") ? "doctor" : "patient";
    return { access_token: "mock-token", user: { id: "u1", name: email.split("@")[0], role } };
  }
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (res.status === 401) throw new Error("Email or password is incorrect.");
  if (!res.ok) throw new Error("Could not sign in. Try again.");
  return res.json();
}

// POST /api/auth/register {name, email, password}. The server must always create a patient.
export async function register(name, email, password) {
  if (MOCK) {
    await wait(300);
    return { access_token: "mock-token", user: { id: `u${Date.now()}`, name, role: "patient" } };
  }
  const res = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password }),
  });
  if (res.status === 409) throw new Error("An account with this email already exists.");
  if (!res.ok) throw new Error("Could not create the account. Try again.");
  return res.json();
}

// POST /api/auth/google {credential}. The backend verifies the Google token.
export async function googleLogin(credential) {
  if (MOCK) {
    await wait(300);
    return { access_token: "mock-token", user: { id: "g1", name: "Google User", role: "patient" } };
  }
  const res = await fetch("/api/auth/google", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential }),
  });
  if (!res.ok) throw new Error("Google sign-in failed. Try again.");
  return res.json();
}

// POST /api/assessments, multipart field "image" -> one assessment object.
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
  // XMLHttpRequest instead of fetch because fetch can't report upload progress.
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append("image", file);
    xhr.open("POST", "/api/assessments");
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status === 401) unauthorizedHandler();
      if (xhr.status < 300) return resolve(JSON.parse(xhr.responseText));
      const messages = {
        413: "The server rejected the file as too large.",
        415: "The server does not accept this file type.",
        504: "The analysis timed out. Try again.",
      };
      reject(new Error(messages[xhr.status] || "The upload failed. Try again."));
    };
    xhr.onerror = () => reject(new Error("Network error. Check your connection and try again."));
    xhr.send(form);
  });
}

// GET /api/assessments -> array of assessment objects (newest first).
export async function listAssessments() {
  if (MOCK) {
    await wait(200);
    return [...mockStore];
  }
  const res = await request("/api/assessments");
  if (!res.ok) throw new Error("Could not load scans.");
  return res.json();
}

// GET /api/assessments/:id -> one assessment object.
export async function getAssessment(id) {
  if (MOCK) {
    await wait(150);
    const item = mockStore.find((r) => r.id === id);
    if (!item) throw new Error("This scan could not be found.");
    return item;
  }
  const res = await request(`/api/assessments/${id}`);
  if (res.status === 404) throw new Error("This scan could not be found.");
  if (!res.ok) throw new Error("Could not load this scan.");
  return res.json();
}

// POST /api/assessments/:id/review {comment, agrees}
export async function saveReview(id, comment, agrees) {
  if (MOCK) {
    await wait(300);
    const item = mockStore.find((r) => r.id === id);
    if (!item) throw new Error("This scan could not be found.");
    item.review = { comment, agrees };
    return;
  }
  const res = await request(`/api/assessments/${id}/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ comment, agrees }),
  });
  if (!res.ok) throw new Error("Could not save the review.");
}