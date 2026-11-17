# Backend: Hybrid QML Fetal Health Platform

Application backend (Member 4). Handles login, roles, patient records, secure ultrasound image upload and storage, and calls the AI service for predictions.

This is a screening-support tool, not a diagnostic device.

## What it does

- Register and login (bcrypt password hashing, JWT tokens)
- Roles: patient, doctor, admin (role-based access control)
- Patient flow: create assessment, upload ultrasound image, run prediction, view history
- Doctor flow: see patients' assessments, view images and predictions, write reviews
- Admin: list users, activate or deactivate accounts, read audit log
- Secure images: format, size and content checks, metadata stripped, random file names, authenticated access, 5-minute expiring links
- Security: audit log, rate limiting, input validation, CORS, secrets in `.env`

Full endpoint list: see `API_CONTRACT.md`. Security details: see `SECURITY_NOTES.md`.

## Requirements

- Python 3.12
- Git

## Setup (first time)

```
cd backend
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # Mac / Linux
pip install -r requirements.txt
```

Create your settings file:

1. Copy `.env.example` to `.env`
2. Generate a secret key and paste it as `SECRET_KEY`:

```
python -c "import secrets; print(secrets.token_hex(32))"
```

3. Check the other settings in `.env`:

| Setting | Meaning |
|---|---|
| `SECRET_KEY` | Long random secret used to sign tokens. Never commit it |
| `AI_SERVICE_URL` | Address of the AI service (default `http://127.0.0.1:8001`) |
| `ALLOWED_ORIGINS` | Frontend addresses allowed to call the API (comma separated, no spaces) |

Create the database tables:

```
alembic upgrade head
```

## Run

Backend (port 8000):

```
cd backend
venv\Scripts\activate
uvicorn main:app --reload
```

Mock AI service (port 8001), in a second terminal:

```
cd backend
venv\Scripts\activate
cd ..\mock_ai_service
uvicorn main:app --reload --port 8001
```

Or the real AI service from Member 3 (`ai-service/`, separate virtual environment because it needs torch and PennyLane):

```
cd ai-service
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn api:app --port 8001
```

The real service starts slowly (up to about two minutes while the model loads). It returns the categories Small, Medium and Large (head circumference, a research prototype, not a diagnosis). Add `?heatmap=true` to `POST /assessments/{id}/predict` to also get a heatmap.

Open `http://127.0.0.1:8000/docs` for the interactive Swagger page.

## Create a doctor or admin account

Register normally (this always creates a patient), then edit `EMAIL` and `NEW_ROLE` in `make_admin.py` and run:

```
python make_admin.py
```

Log in again afterwards so the new role is in your token.

## Run the tests

```
pip install pytest
pytest -v
```

Tests use a temporary in-memory database, a temporary upload folder and a fake AI service, so your real `app.db` and `uploads_data/` are not touched.

## Database changes (Alembic)

After changing `models.py`:

```
alembic revision --autogenerate -m "describe the change"
alembic upgrade head
```

## Project structure

```
backend/
  main.py                 API endpoints and security logic
  models.py               Database tables
  database.py             Database connection
  make_admin.py           Helper to give a user the doctor or admin role
  alembic/                Migration scripts
  tests/                  Automated tests (pytest)
  requirements.txt        Python packages
  .env.example            Sample settings (copy to .env)
  Dockerfile              Container build (not yet tested locally)
  API_CONTRACT.md         Endpoint reference for the frontend
  SECURITY_NOTES.md       Security decisions and open items
```

## Not committed to Git

`venv/`, `.env`, `*.db`, `uploads_data/` (secrets, patient images and local data).

## Known open items

- Sign in with Google (Firebase): waiting for frontend decisions
- Real AI service is integrated and tested locally; running it together with the backend in docker-compose is still to be done
- docker-compose with the AI service, cloud deployment, PostgreSQL: to be done with the team
- Dockerfile is written but not yet tested on this machine

## Dataset credit

FETAL_PLANES_DB (Burgos-Artizzu et al., Scientific Reports 10, 10200, 2020; DOI 10.5281/zenodo.3904280) and Large-Scale Annotation Dataset for Fetal Head Biometry in Ultrasound Images (Alzubaidi et al., Data in Brief, 2023; DOI 10.5281/zenodo.8265464). Both CC BY 4.0.