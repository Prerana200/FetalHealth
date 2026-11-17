# API Contract (Contract 2): Backend for Frontend

Project: Hybrid QML Platform for Fetal Health
Owner: Member 4 (Backend). Reader: Member 5 (Frontend).
Version: 1.4 (draft). Real AI model classes (Small, Medium, Large), heatmap support, `502` error, `prediction_id` and `has_heatmap` in lists.

Base URL (local): `http://127.0.0.1:8000`
Live, testable docs (Swagger): `http://127.0.0.1:8000/docs`

---

## 1. General Rules

| Topic | Rule |
|---|---|
| Data format | JSON, except login (form) and image upload (multipart) |
| Auth | Send `Authorization: Bearer <access_token>` on every protected endpoint |
| Token expiry | 30 minutes. After that the backend returns `401`; the user must log in again |
| Roles | `patient`, `doctor`, `admin` (role is inside the token; a new token is needed if the role changes) |
| Error format | `{ "detail": "message" }` |
| Validation error | `422` with a `detail` list; each item has `loc` (which field) and `msg` |
| Rate limits | `POST /login`: 5 per minute. `POST /register`: 10 per minute. Over the limit gives `429` |
| CORS | Only addresses listed in the backend `ALLOWED_ORIGINS` setting can call the API |

### Status codes used

| Code | Meaning here |
|---|---|
| 200 / 201 | OK / created |
| 400 | Bad request (empty file, corrupt image, email already registered, no image uploaded yet) |
| 401 | Not logged in, wrong password, or token expired |
| 403 | Logged in, but role is not allowed (or the account is deactivated, at login) |
| 404 | Not found, or belongs to another patient (the backend does not reveal which) |
| 413 | Image larger than 10 MB |
| 415 | Image is not JPEG or PNG |
| 422 | Request body or field is invalid |
| 429 | Too many requests |
| 502 | AI service answered in an unexpected format |
| 503 | AI service is down or too slow |

---

## 2. Endpoints at a Glance

| Method | URL | Who | Purpose |
|---|---|---|---|
| GET | `/health` | Anyone | Is the backend alive? |
| POST | `/register` | Anyone | Create a patient account |
| POST | `/login` | Anyone | Get an access token |
| GET | `/me` | Any logged-in user | Who am I? |
| POST | `/assessments` | Logged-in user | Start a new screening |
| GET | `/assessments` | Logged-in user | My screenings (own only), with latest result and image ids |
| GET | `/assessments/{id}` | Owner of the assessment | One of my screenings in detail (all predictions, probabilities, doctor comments) |
| POST | `/assessments/{id}/image` | Owner of the assessment | Upload an ultrasound image |
| POST | `/assessments/{id}/predict` | Owner of the assessment | Run the AI on the latest image (add `?heatmap=true` for a heatmap) |
| POST | `/predictions/{prediction_id}/heatmap/link` | Owner, doctor, admin | Get a temporary heatmap link (5 minutes) |
| GET | `/heatmap-links/{token}` | Anyone with the link | Open the heatmap PNG (no header needed) |
| GET | `/images/{image_id}` | Owner, doctor, admin | Download an image (needs the Authorization header) |
| POST | `/images/{image_id}/link` | Owner, doctor, admin | Get a temporary image link (5 minutes) |
| GET | `/image-links/{token}` | Anyone with the link | Open the image from a temporary link (no header needed) |
| GET | `/doctor/assessments` | Doctor, admin | All patients' screenings |
| GET | `/doctor/assessments/{id}` | Doctor, admin | One screening in detail |
| POST | `/doctor/predictions/{prediction_id}/review` | Doctor, admin | Add a review comment |
| GET | `/admin/users` | Admin | List all users |
| POST | `/admin/users` | Admin | Create a user with a chosen role |
| PUT | `/admin/users/{user_id}/role` | Admin | Change a user's role |
| PUT | `/admin/users/{user_id}/active` | Admin | Activate or deactivate a user |
| GET | `/admin/audit-logs` | Admin | Latest 100 audit entries |

---

## 3. Endpoint Details

### 3.1 Auth

#### POST `/register`
Creates a **patient** account. Doctor and admin accounts cannot be created here.

Request (JSON):
```json
{ "name": "Riya", "email": "riya@gmail.com", "password": "mypassword123" }
```
Rules: name 1 to 100 characters, valid email format, password 8 to 72 characters.

Response `201`:
```json
{ "message": "User registered successfully", "id": 1, "name": "Riya", "email": "riya@gmail.com", "role": "patient" }
```
Errors: `400` email already registered, `422` invalid field, `429` too many requests.

#### POST `/login`
**Important:** this is **form data**, not JSON, and the email goes in a field called `username`.

Request: `Content-Type: application/x-www-form-urlencoded`
```
username=riya@gmail.com&password=mypassword123
```
Response `200`:
```json
{ "access_token": "<long token>", "token_type": "bearer" }
```
Errors: `401` invalid email or password, `403` account is deactivated, `429` too many attempts.

#### GET `/me`  (auth)
Response `200`:
```json
{ "id": 1, "name": "Riya", "email": "riya@gmail.com", "role": "patient" }
```
Use this after login to know the role and decide which screens to show.

---

### 3.2 Patient flow (auth)

#### POST `/assessments`
No body. Response `201`:
```json
{ "id": 3, "status": "pending", "created_at": "2026-11-03T06:21:41.240998" }
```

#### GET `/assessments`
Only the logged-in user's own assessments. Use this for the history list. Response `200`:
```json
[
  {
    "id": 3,
    "status": "completed",
    "created_at": "2026-11-03T06:21:41.240998",
    "predicted_class": "Medium",
    "probabilities": { "Small": 0.20, "Medium": 0.70, "Large": 0.10 },
    "model_version": "hybrid-fetal-hc-v1.0.0",
    "prediction_id": 7,
    "has_heatmap": true,
    "image_ids": [5]
  },
  {
    "id": 4,
    "status": "pending",
    "created_at": "2026-11-04T09:10:00.000000",
    "predicted_class": null,
    "probabilities": null,
    "model_version": null,
    "prediction_id": null,
    "has_heatmap": false,
    "image_ids": []
  }
]
```
`status` is `pending` until a prediction is run, then `completed`.
`predicted_class`, `probabilities`, `model_version`, `prediction_id` and `has_heatmap` come from the latest prediction, or are `null` / `false` if there is none yet.
`image_ids` is empty until an image is uploaded.

#### GET `/assessments/{id}`
One of the logged-in user's own assessments, in detail. Use this for the history detail screen. Response `200`:
```json
{
  "id": 3,
  "status": "completed",
  "created_at": "2026-11-03T06:21:41.240998",
  "image_ids": [5],
  "predictions": [
    {
      "id": 7,
      "predicted_class": "Medium",
      "probabilities": { "Small": 0.20, "Medium": 0.70, "Large": 0.10 },
      "model_version": "hybrid-fetal-hc-v1.0.0",
      "has_heatmap": true,
      "disclaimer": "Screening support only, not a diagnosis.",
      "reviews": [ { "comment": "Plane looks correct.", "agrees": true, "created_at": "2026-11-05T10:00:00" } ]
    }
  ]
}
```
`reviews` holds the doctor comments (the doctor's id is not shown to patients).
Errors: `404` not found, or belongs to another patient.
Use each id in `image_ids` with `GET /images/{image_id}`.

#### POST `/assessments/{id}/image`
Request: `multipart/form-data` with one field named `file`.

Rules: JPEG or PNG only, maximum 10 MB, must be a real image. The backend strips metadata (EXIF) and stores the file privately.

Response `201`:
```json
{
  "id": 5,
  "assessment_id": 1,
  "size_bytes": 464293,
  "content_type": "image/jpeg",
  "sha256": "0f9d68ca..."
}
```
Errors: `400` empty or corrupt file, `404` assessment not found (or not yours), `413` too large, `415` wrong format.

Keep the returned `id`: it is the `image_id` for `GET /images/{image_id}`.

#### POST `/assessments/{id}/predict`
No body. Uses the latest image of that assessment. Takes well under a second for the real model without a heatmap; the backend retries the AI service up to 3 times.

Optional query parameter: `?heatmap=true` also creates a heatmap (slower, timeout 30 seconds). Default is no heatmap.

Response `201`:
```json
{
  "id": 7,
  "assessment_id": 1,
  "predicted_class": "Medium",
  "probabilities": { "Small": 0.20, "Medium": 0.70, "Large": 0.10 },
  "model_version": "hybrid-fetal-hc-v1.0.0",
  "has_heatmap": true,
  "heatmap_note": "Shows which pixels changed the model output the most. It is not proof of a finding.",
  "disclaimer": "Screening support only, not a diagnosis."
}
```
`has_heatmap` is `false` when no heatmap was asked for or it could not be created. If one was asked for but could not be created, `heatmap_message` explains it, and the prediction is still saved.
Errors: `400` no image uploaded yet, `404` assessment not found, `502` unexpected AI response, `503` AI service unavailable.

The classes are **Small, Medium and Large**: head-circumference categories derived from dataset percentiles, not clinical diagnoses. Show the `disclaimer`, `model_version` and `heatmap_note` in the UI.

#### POST `/predictions/{prediction_id}/heatmap/link`  (auth)
Creates a temporary link for the heatmap of one prediction. A patient can only use their own predictions; doctor and admin can use any.

Response `200`:
```json
{ "url": "/heatmap-links/eyJhbGciOi...", "expires_in_seconds": 300, "note": "Shows which pixels changed the model output the most. It is not proof of a finding." }
```
Errors: `404` prediction not found, not yours, or it has no heatmap.

#### GET `/heatmap-links/{token}`  (no auth header needed)
Open `BASE_URL + url` in `<img src>`. Returns a PNG (256 by 256 pixels). Works for 5 minutes, then `401 Link expired or invalid`. A login token or an image link cannot be used here. The map is a visualisation of the model, may also highlight scan borders or background, and is not proof of a finding.

#### GET `/images/{image_id}`  (auth)
Returns the image file (`image/jpeg` or `image/png`).
A patient can only get their own images. Doctor and admin can get any. Others get `404`.

**Note for frontend:** a plain `<img src="/images/5">` will not work here because this endpoint needs the `Authorization` header. Use the temporary link endpoint below instead (simplest), or fetch with the header and use `URL.createObjectURL(blob)`.

#### POST `/images/{image_id}/link`  (auth)
Creates a temporary link for one image. The same permission rules apply (a patient can only create links for their own images).

Response `200`:
```json
{ "url": "/image-links/eyJhbGciOi...", "expires_in_seconds": 300 }
```
Errors: `404` image not found (or not yours).

#### GET `/image-links/{token}`  (no auth header needed)
Open `BASE_URL + url` directly in `<img src>`. Works for 5 minutes, then returns `401 Link expired or invalid`. Ask for a new link when it expires.
Anyone who has the link can open the image until it expires, so do not share or store these links.

---

### 3.3 Doctor (auth, role `doctor` or `admin`)

#### GET `/doctor/assessments`
```json
[
  {
    "id": 1,
    "patient_id": 2,
    "patient_name": "Aman",
    "status": "completed",
    "created_at": "2026-11-03T06:19:29.546498",
    "predicted_class": "Medium",
    "probabilities": { "Small": 0.20, "Medium": 0.70, "Large": 0.10 },
    "model_version": "hybrid-fetal-hc-v1.0.0",
    "prediction_id": 7,
    "has_heatmap": true
  }
]
```

#### GET `/doctor/assessments/{id}`
```json
{
  "id": 1,
  "patient_name": "Aman",
  "status": "completed",
  "created_at": "2026-11-03T06:19:29.546498",
  "image_ids": [5],
  "predictions": [
    {
      "id": 7,
      "predicted_class": "Medium",
      "probabilities": { "Small": 0.20, "Medium": 0.70, "Large": 0.10 },
      "model_version": "hybrid-fetal-hc-v1.0.0",
      "has_heatmap": true,
      "reviews": [ { "doctor_id": 4, "comment": "Plane looks correct.", "agrees": true, "created_at": "2026-11-05T10:00:00" } ]
    }
  ]
}
```
Use each id in `image_ids` with `GET /images/{image_id}`. Error: `404` not found, `403` not a doctor.

#### POST `/doctor/predictions/{prediction_id}/review`
Request:
```json
{ "comment": "Plane looks correct, image quality is good.", "agrees": true }
```
`agrees` is optional (default `true`). Use `false` when the doctor disputes the result. `comment` is required (it may be an empty string), maximum 2000 characters. Send the plain comment; the old `[agrees]` tag is no longer needed.

Response `201`:
```json
{ "id": 1, "prediction_id": 7, "comment": "Plane looks correct, image quality is good.", "agrees": true }
```

---

### 3.4 Admin (auth, role `admin`)

#### GET `/admin/users`
```json
[ { "id": 1, "name": "Riya", "email": "riya@gmail.com", "role": "admin", "is_active": true } ]
```

#### POST `/admin/users`
Creates a user with a chosen role (the only way, besides the admin script, to create a doctor or admin).

Request:
```json
{ "name": "Dr Rao", "email": "rao@gmail.com", "password": "password123", "role": "doctor" }
```
`role` is `patient`, `doctor` or `admin` (default `patient`). Same name, email and password rules as `/register`.

Response `201`:
```json
{ "id": 5, "name": "Dr Rao", "email": "rao@gmail.com", "role": "doctor", "is_active": true }
```
Errors: `400` email already registered, `403` not an admin, `422` invalid field or role.

#### PUT `/admin/users/{user_id}/role`
Request:
```json
{ "role": "doctor" }
```
Response `200`:
```json
{ "id": 3, "email": "sara@gmail.com", "role": "doctor" }
```
Errors: `400` admin tried to change their own role, `404` user not found, `422` invalid role, `403` not an admin.
The user's role takes effect immediately for permission checks. Their displayed role in the app updates after the next `GET /me`.

#### PUT `/admin/users/{user_id}/active`
Request:
```json
{ "is_active": false }
```
Response `200`:
```json
{ "id": 3, "email": "sara@gmail.com", "is_active": false }
```
A deactivated user cannot log in, and their existing token stops working immediately.
Errors: `400` admin tried to change their own status, `404` user not found, `403` not an admin.

#### GET `/admin/audit-logs`
Latest 100 entries, newest first.
```json
[ { "id": 3, "user_id": 1, "action": "login_success", "detail": null, "created_at": "2026-11-06T18:42:16.480658" } ]
```
Actions recorded: `login_success`, `login_failed`, `login_blocked_inactive`, `image_uploaded`, `image_viewed`, `image_link_created`, `image_viewed_via_link`, `heatmap_link_created`, `heatmap_viewed_via_link`, `prediction_run`, `review_added`, `user_activated`, `user_deactivated`, `user_created_by_admin`, `user_role_changed`.

---

## 4. Not Available Yet (planned)

| Item | Status |
|---|---|
| Pixel size input | The real model assumes a default pixel size (0.128 mm, the training median) because uploaded images carry none. Categories are therefore approximate |
| Sign in with Google (Firebase) | Parked. Planned shape when added: `POST /auth/google` with `{ "id_token": "<Firebase ID token>" }`, returning the same `{ "access_token", "token_type" }` as `/login`. Nothing changes for the frontend until then |
| Chat endpoint | Not planned. The frontend keeps its fixed answers |
| Password change, forgot password | Not planned yet |

Any change to this contract will be announced before it is made.