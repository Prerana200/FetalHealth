"""Backend smoke test: register -> login -> assessment -> upload -> predict(heatmap) -> link -> PNG.
Run (backend on :8000, AI service on :8001):  python tests/backend_smoke.py [BASE_URL]
Needs: pip install httpx pillow
"""
import io, sys, time, uuid
import httpx
from PIL import Image

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000"
ok = fail = 0

def check(name, cond, extra=""):
    global ok, fail
    if cond: ok += 1; print(f"PASS  {name}")
    else:    fail += 1; print(f"FAIL  {name}  {extra}")

def png_bytes():
    buf = io.BytesIO()
    Image.effect_noise((256, 256), 60).convert("RGB").save(buf, "PNG")
    return buf.getvalue()

c = httpx.Client(base_url=BASE, timeout=60)
r = c.get("/health"); check("health", r.status_code == 200, r.text)

email = f"smoke_{uuid.uuid4().hex[:8]}@example.com"
r = c.post("/register", json={"name": "Smoke", "email": email, "password": "password123"})
check("register 201, role patient", r.status_code == 201 and r.json().get("role") == "patient", r.text)

r = c.post("/login", data={"username": email, "password": "password123"})
check("login 200", r.status_code == 200, r.text)
auth = {"Authorization": f"Bearer {r.json()['access_token']}"} if r.status_code == 200 else {}

r = c.post("/login", data={"username": email, "password": "wrong-pass"})
check("wrong password 401", r.status_code == 401, r.text)

r = c.get("/me", headers=auth); check("/me", r.status_code == 200 and r.json()["email"] == email, r.text)
r = c.get("/assessments"); check("no token -> 401", r.status_code == 401, r.text)
r = c.get("/doctor/assessments", headers=auth); check("patient on doctor route -> 403", r.status_code == 403, r.text)

r = c.post("/assessments", headers=auth); check("create assessment", r.status_code == 201, r.text)
aid = r.json()["id"]

r = c.post(f"/assessments/{aid}/predict", headers=auth); check("predict before image -> 400", r.status_code == 400, r.text)

r = c.post(f"/assessments/{aid}/image", headers=auth, files={"file": ("x.txt", b"hello", "text/plain")})
check("fake image (text file) -> 400", r.status_code == 400, r.text)
gif = io.BytesIO(); Image.new("RGB", (8, 8)).save(gif, "GIF")
r = c.post(f"/assessments/{aid}/image", headers=auth, files={"file": ("x.gif", gif.getvalue(), "image/gif")})
check("real GIF image -> 415", r.status_code == 415, r.text)
r = c.post(f"/assessments/{aid}/image", headers=auth, files={"file": ("scan.png", png_bytes(), "image/png")})
check("image upload 201", r.status_code == 201, r.text)
img_id = r.json().get("id")

r = c.post(f"/assessments/{aid}/predict?heatmap=true", headers=auth)
check("predict 201", r.status_code == 201, r.text)
pred = r.json()
print("      class:", pred.get("predicted_class"), "| heatmap:", pred.get("has_heatmap"), "| model:", pred.get("model_version"))
check("classes are Small/Medium/Large (contract v1.4)",
      set(pred.get("probabilities", {})) == {"Small", "Medium", "Large"}, str(pred.get("probabilities")))

if pred.get("has_heatmap"):
    r = c.post(f"/predictions/{pred['id']}/heatmap/link", headers=auth)
    check("heatmap link 200", r.status_code == 200, r.text)
    r = c.get(r.json()["url"])
    check("heatmap PNG opens", r.status_code == 200 and r.headers["content-type"] == "image/png", r.text[:100])
else:
    print("SKIP  heatmap link (AI service returned no heatmap)", pred.get("heatmap_message", ""))

r = c.post(f"/images/{img_id}/link", headers=auth); check("image link 200", r.status_code == 200, r.text)
r = c.get(r.json()["url"]); check("image opens via link", r.status_code == 200 and r.headers["content-type"].startswith("image/"), r.text[:100])

r = c.get("/assessments", headers=auth)
row = next((a for a in r.json() if a["id"] == aid), {})
check("history shows completed + prediction_id + image_ids",
      row.get("status") == "completed" and row.get("prediction_id") == pred["id"] and row.get("image_ids") == [img_id], str(row))

r = c.delete(f"/assessments/{aid}", headers=auth)
print(f"INFO  DELETE /assessments/{{id}} -> {r.status_code} (contract has no delete endpoint)")

print(f"\n{ok} passed, {fail} failed")
sys.exit(1 if fail else 0)
