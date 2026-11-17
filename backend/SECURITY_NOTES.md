# Security Notes: Backend (Member 4)

Project: Hybrid QML Platform for Fetal Health
Scope: the application backend (FastAPI). This document lists what is implemented, why, and what is still open.

The application is a screening-support tool, not a diagnostic device. Only public or anonymised dataset images should be used for demos.

---

## 1. Implemented Controls

| # | Area | What we did | Why |
|---|---|---|---|
| 1 | Password storage | Passwords are hashed with bcrypt (with salt). Plain passwords are never stored or returned | If the database leaks, real passwords stay protected |
| 2 | Authentication | Login returns a signed JWT that expires after 30 minutes | Users prove identity without sending the password on every request |
| 3 | Login errors | Wrong email and wrong password give the same message ("Invalid email or password") | Stops attackers from finding out which emails exist |
| 4 | Role-based access (RBAC) | Roles: patient, doctor, admin. A `require_role` check protects doctor and admin endpoints (403 otherwise) | Each role only reaches what it needs |
| 5 | Privilege escalation | `/register` always creates a patient. Doctor and admin roles are assigned only by an administrator with server access | Nobody can make themselves admin |
| 6 | Data ownership | Patient queries always filter by the logged-in user's id taken from the token, never from the request | A patient cannot read another patient's assessments or images |
| 7 | No information leak | Another patient's assessment or image returns 404, not 403 | Does not reveal that the record exists |
| 8 | Upload validation | Maximum 10 MB, JPEG and PNG only, content verified with Pillow (not just the file extension), corrupt files rejected | Blocks fake or dangerous files |
| 9 | Metadata stripping | The image is rebuilt from pixels only, so EXIF data (such as GPS and device info) is dropped | Protects patient privacy |
| 10 | Safe file storage | Files get random UUID names, the original file name is never used, and the folder is outside any public URL | Prevents path tricks and guessing |
| 11 | Image integrity | SHA-256 hash of each stored image is saved in the database | Allows tamper and duplicate checks |
| 12 | Controlled image access | Images are served only through an authenticated endpoint that checks ownership or role | No direct public links to patient images |
| 13 | Audit log | Records login success and failure, image upload, image view, prediction run, review added. Only admin can read it. Passwords, tokens and image data are never logged | Accountability: who did what and when |
| 14 | Rate limiting | `/login` 5 per minute and `/register` 10 per minute per IP address (returns 429) | Slows down password guessing |
| 15 | Input validation | Email format, password 8 to 72 characters, name 1 to 100 characters | Rejects bad input before it reaches the database |
| 16 | Secrets management | `SECRET_KEY` and service addresses are read from `.env`, which is excluded from Git. `.env.example` documents the settings | Secrets stay out of the repository |
| 17 | CORS | Only frontend addresses listed in `ALLOWED_ORIGINS` may call the API from a browser | Blocks other websites from using the API |
| 18 | AI service calls | Timeout (10 seconds), up to 3 retries for network or server errors, clear 503 when unavailable | Avoids hanging requests and confusing errors |
| 19 | Database access | All queries use SQLAlchemy ORM (parameterised) | Protects against SQL injection |
| 20 | Safe wording | Prediction responses include a disclaimer: screening support, not a diagnosis | Prevents misuse of results |
| 21 | Expiring image links | A permission-checked, signed link valid for 5 minutes lets the frontend show an image without exposing the login token. Login tokens cannot be used as image links, and the response is marked no-store | Time-limited access to patient images |
| 22 | Account deactivation | An admin can deactivate a user. The user cannot log in and the existing token stops working at once. An admin cannot deactivate themselves. Changes are audit-logged | Removes access quickly when needed |
| 24 | Admin user management | Only admins can create users or change roles. Admins cannot change their own role or status. Every change is audit-logged | Controlled privilege changes |
| 25 | Heatmap handling | The AI service heatmap is decoded, checked as a real PNG (maximum 5 MB) and stored in the private folder with a random name. Access is only through permission-checked, 5-minute signed links that cannot be mixed up with login tokens or image links. Error text from the AI service is not passed on to users | Unsafe or leaked AI output |
| 23 | Schema migrations | Alembic migration scripts track database changes without losing data | Safe, repeatable database updates |

---

## 2. Known Limitations and Open Items

We list these openly so the team and evaluators know the real state.

| # | Item | Status / plan |
|---|---|---|
| 1 | Image link sharing | Links expire after 5 minutes but are not single-use or tied to one device. Anyone holding a valid link can open the image until it expires |
| 2 | HTTPS | Not configured in local development. Must be enabled by the reverse proxy at deployment |
| 3 | Encryption at rest (database fields and image files) | Not implemented. Plan: encrypted disk or object storage with encryption at deployment |
| 4 | Database | SQLite for development. PostgreSQL planned for deployment, with Alembic migrations |
| 5 | Old secret key in Git history | An early placeholder `SECRET_KEY` was committed before moving to `.env`. It is no longer used. Rule from now on: secrets go to `.env` from day one |
| 6 | Token handling | 30-minute access token, no refresh token and no logout or revoke list |
| 7 | Rate limiting scope | Per IP address and kept in memory (resets on restart, not shared across several server copies) |
| 8 | Account lockout, password reset, email verification | Not implemented |
| 9 | Google Sign-In (Firebase) | Parked, pending decisions with the frontend owner |
| 10 | Upload size limit at the proxy | The 10 MB limit is enforced in code. The reverse proxy limit must also be set at deployment |
| 11 | Audit log protection | Stored in the same database. Not tamper-proof |
| 12 | Doctor access scope | Any doctor can see all patients' assessments (no doctor-patient assignment yet) |
| 14 | Service-to-service trust | The backend calls the AI service without authentication; it must run on a private network (for example the docker-compose network) and not be exposed publicly |
| 13 | Dataset licence | The two datasets are CC BY 4.0. Credit must appear on the attribution page |

---

## 3. Data Handling Summary

| Data | Where | Protection |
|---|---|---|
| Passwords | `users.password_hash` | bcrypt hash |
| Ultrasound images | `uploads_data/` (not in Git) | Random names, metadata stripped, authenticated access only |
| Image metadata | `image_assets` table | Hash, size, type (no original file name) |
| Predictions | `predictions` table | Per assessment, tied to the owner |
| Doctor reviews | `doctor_reviews` table | Linked to the doctor's user id |
| Audit trail | `audit_logs` table | Admin-only access |
| Secrets | `.env` (not in Git) | Never committed |

Files excluded from Git: `venv/`, `.env`, `*.db`, `uploads_data/`.

---

## 4. How to Verify (quick checks)

| Check | Expected result |
|---|---|
| Open a protected endpoint without a token | 401 |
| Patient calls `/doctor/assessments` or `/admin/users` | 403 |
| Patient requests another patient's image id | 404 |
| Upload a text file renamed to `.jpg` | 400 |
| Upload a GIF | 415 |
| Upload a file over 10 MB | 413 |
| Six wrong logins in one minute | 429 on the sixth |
| Register with a short password or invalid email | 422 |
| Request from an origin not in `ALLOWED_ORIGINS` | CORS error (400 on preflight) |
| Stop the AI service and call predict | 503 after retries |