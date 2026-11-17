import httpx

import main


# ---------- Basics + Register / Login ----------

def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_register_ok_and_hides_password(client):
    r = client.post(
        "/register",
        json={"name": "Riya", "email": "riya@gmail.com", "password": "password123"},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["role"] == "patient"
    assert "password" not in body and "password_hash" not in body


def test_register_duplicate_email(client, make_user):
    make_user("riya@gmail.com")
    r = client.post(
        "/register",
        json={"name": "Riya", "email": "riya@gmail.com", "password": "password123"},
    )
    assert r.status_code == 400


def test_register_validation(client):
    bad_email = {"name": "A", "email": "abc", "password": "password123"}
    short_pw = {"name": "A", "email": "a@gmail.com", "password": "123"}
    empty_name = {"name": "", "email": "a@gmail.com", "password": "password123"}
    for body in (bad_email, short_pw, empty_name):
        assert client.post("/register", json=body).status_code == 422


def test_login_wrong_password(client, make_user):
    make_user("riya@gmail.com")
    r = client.post("/login", data={"username": "riya@gmail.com", "password": "wrongwrong"})
    assert r.status_code == 401


def test_login_rate_limit(client):
    main.limiter.reset()
    main.limiter.enabled = True
    try:
        codes = [
            client.post(
                "/login", data={"username": "x@gmail.com", "password": "wrongwrong"}
            ).status_code
            for _ in range(6)
        ]
    finally:
        main.limiter.enabled = False
        main.limiter.reset()
    assert codes[:5] == [401] * 5
    assert codes[5] == 429


def test_me_requires_token(client, make_user):
    assert client.get("/me").status_code == 401
    headers = make_user("riya@gmail.com")
    r = client.get("/me", headers=headers)
    assert r.status_code == 200 and r.json()["email"] == "riya@gmail.com"


# ---------- RBAC ----------

def test_admin_users_only_for_admin(client, make_user):
    patient = make_user("aman@gmail.com")
    admin = make_user("riya@gmail.com", role="admin")
    assert client.get("/admin/users", headers=patient).status_code == 403
    assert client.get("/admin/users", headers=admin).status_code == 200


# ---------- Assessments: har user ka data alag ----------

def test_assessments_are_isolated(client, make_user):
    a = make_user("aman@gmail.com")
    b = make_user("sara@gmail.com")
    aid = client.post("/assessments", headers=a).json()["id"]
    assert len(client.get("/assessments", headers=a).json()) == 1
    assert client.get("/assessments", headers=b).json() == []
    assert client.get(f"/assessments/{aid}", headers=b).status_code == 404
    assert client.get(f"/assessments/{aid}", headers=a).status_code == 200


# ---------- Image upload ----------

def test_upload_valid_image(patient_with_image):
    assert patient_with_image["image_id"] > 0


def test_upload_rejects_bad_files(client, make_user, jpeg_bytes, gif_bytes):
    h = make_user("aman@gmail.com")
    aid = client.post("/assessments", headers=h).json()["id"]
    url = f"/assessments/{aid}/image"

    fake = client.post(url, files={"file": ("fake.jpg", b"just text", "image/jpeg")}, headers=h)
    assert fake.status_code == 400

    gif = client.post(url, files={"file": ("a.gif", gif_bytes, "image/gif")}, headers=h)
    assert gif.status_code == 415

    empty = client.post(url, files={"file": ("e.jpg", b"", "image/jpeg")}, headers=h)
    assert empty.status_code == 400


def test_upload_to_other_users_assessment(client, make_user, jpeg_bytes):
    a = make_user("aman@gmail.com")
    b = make_user("sara@gmail.com")
    aid = client.post("/assessments", headers=a).json()["id"]
    r = client.post(
        f"/assessments/{aid}/image",
        files={"file": ("s.jpg", jpeg_bytes, "image/jpeg")},
        headers=b,
    )
    assert r.status_code == 404


# ---------- Predict ----------

def test_predict_needs_image(client, make_user):
    h = make_user("aman@gmail.com")
    aid = client.post("/assessments", headers=h).json()["id"]
    assert client.post(f"/assessments/{aid}/predict", headers=h).status_code == 400


def test_predict_ok_completes_assessment(client, patient_with_image):
    p = patient_with_image
    r = client.post(f"/assessments/{p['assessment_id']}/predict", headers=p["headers"])
    assert r.status_code == 201
    assert r.json()["predicted_class"] == "Brain"
    assert "disclaimer" in r.json()
    mine = client.get("/assessments", headers=p["headers"]).json()
    assert mine[0]["status"] == "completed"
    assert mine[0]["predicted_class"] == "Brain"


def test_predict_returns_503_when_ai_down(client, patient_with_image, monkeypatch):
    def broken(*args, **kwargs):
        raise httpx.ConnectError("AI service down")

    monkeypatch.setattr(main, "call_ai_service", broken)
    p = patient_with_image
    r = client.post(f"/assessments/{p['assessment_id']}/predict", headers=p["headers"])
    assert r.status_code == 503


# ---------- Image access + expiring links ----------

def test_image_access_rules(client, make_user, patient_with_image):
    p = patient_with_image
    other = make_user("sara@gmail.com")
    doctor = make_user("dr@gmail.com", role="doctor")
    url = f"/images/{p['image_id']}"
    assert client.get(url).status_code == 401
    assert client.get(url, headers=p["headers"]).status_code == 200
    assert client.get(url, headers=other).status_code == 404
    assert client.get(url, headers=doctor).status_code == 200


def test_image_link_works_without_login_and_rejects_tampering(client, make_user, patient_with_image):
    p = patient_with_image
    r = client.post(f"/images/{p['image_id']}/link", headers=p["headers"])
    assert r.status_code == 200
    link = r.json()["url"]

    assert client.get(link).status_code == 200  # bina login ke

    i = len(link) - 10
    changed = "A" if link[i] != "A" else "B"
    tampered = link[:i] + changed + link[i + 1:]
    assert client.get(tampered).status_code == 401

    # login token ko image link ki tarah use nahi kar sakte
    login_token = p["headers"]["Authorization"].split(" ")[1]
    assert client.get(f"/image-links/{login_token}").status_code == 401

    # dusra patient link nahi bana sakta
    other = make_user("sara@gmail.com")
    assert client.post(f"/images/{p['image_id']}/link", headers=other).status_code == 404


# ---------- Doctor flow ----------

def test_doctor_review_flow(client, make_user, patient_with_image):
    p = patient_with_image
    aid = p["assessment_id"]
    pred_id = client.post(f"/assessments/{aid}/predict", headers=p["headers"]).json()["id"]
    doctor = make_user("dr@gmail.com", role="doctor")

    assert client.get("/doctor/assessments", headers=p["headers"]).status_code == 403
    assert client.get("/doctor/assessments", headers=doctor).status_code == 200

    r = client.post(
        f"/doctor/predictions/{pred_id}/review",
        json={"comment": "Looks fine"},
        headers=doctor,
    )
    assert r.status_code == 201

    detail = client.get(f"/doctor/assessments/{aid}", headers=doctor).json()
    assert detail["predictions"][0]["reviews"][0]["comment"] == "Looks fine"

    mine = client.get(f"/assessments/{aid}", headers=p["headers"]).json()
    review = mine["predictions"][0]["reviews"][0]
    assert review["comment"] == "Looks fine"
    assert "doctor_id" not in review  # patient ko doctor ka id nahi dikhta


# ---------- Admin: deactivate + audit log ----------

def test_admin_deactivates_and_reactivates_user(client, make_user):
    admin = make_user("riya@gmail.com", role="admin")
    user = make_user("sara@gmail.com")
    uid = client.get("/me", headers=user).json()["id"]

    r = client.put(f"/admin/users/{uid}/active", json={"is_active": False}, headers=admin)
    assert r.status_code == 200 and r.json()["is_active"] is False

    assert client.get("/me", headers=user).status_code == 401  # purana token bekaar
    r = client.post("/login", data={"username": "sara@gmail.com", "password": "password123"})
    assert r.status_code == 403

    client.put(f"/admin/users/{uid}/active", json={"is_active": True}, headers=admin)
    r = client.post("/login", data={"username": "sara@gmail.com", "password": "password123"})
    assert r.status_code == 200


def test_admin_cannot_deactivate_self(client, make_user):
    admin = make_user("riya@gmail.com", role="admin")
    my_id = client.get("/me", headers=admin).json()["id"]
    r = client.put(f"/admin/users/{my_id}/active", json={"is_active": False}, headers=admin)
    assert r.status_code == 400


def test_audit_log_admin_only_and_records_login(client, make_user):
    patient = make_user("aman@gmail.com")
    admin = make_user("riya@gmail.com", role="admin")
    assert client.get("/admin/audit-logs", headers=patient).status_code == 403
    r = client.get("/admin/audit-logs", headers=admin)
    assert r.status_code == 200
    assert "login_success" in [row["action"] for row in r.json()]


# ---------- Frontend requests (v1.3) ----------

def test_list_endpoints_include_prediction_summary(client, make_user, patient_with_image):
    p = patient_with_image
    aid = p["assessment_id"]
    client.post(f"/assessments/{aid}/predict", headers=p["headers"])
    doctor = make_user("dr@gmail.com", role="doctor")

    mine = client.get("/assessments", headers=p["headers"]).json()[0]
    assert mine["model_version"] == "test-v1"
    assert mine["probabilities"]["Brain"] == 0.82

    row = client.get("/doctor/assessments", headers=doctor).json()[0]
    assert row["predicted_class"] == "Brain"
    assert row["model_version"] == "test-v1"
    assert "Brain" in row["probabilities"]

    detail = client.get(f"/doctor/assessments/{aid}", headers=doctor).json()
    assert detail["created_at"]


def test_summary_is_null_before_prediction(client, make_user):
    h = make_user("aman@gmail.com")
    doctor = make_user("dr@gmail.com", role="doctor")
    client.post("/assessments", headers=h)
    mine = client.get("/assessments", headers=h).json()[0]
    assert mine["predicted_class"] is None and mine["probabilities"] is None
    row = client.get("/doctor/assessments", headers=doctor).json()[0]
    assert row["predicted_class"] is None and row["model_version"] is None


def test_review_agrees_field(client, make_user, patient_with_image):
    p = patient_with_image
    aid = p["assessment_id"]
    pred_id = client.post(f"/assessments/{aid}/predict", headers=p["headers"]).json()["id"]
    doctor = make_user("dr@gmail.com", role="doctor")
    url = f"/doctor/predictions/{pred_id}/review"

    r = client.post(url, json={"comment": "Not the right plane", "agrees": False}, headers=doctor)
    assert r.status_code == 201 and r.json()["agrees"] is False
    r = client.post(url, json={"comment": "Fine"}, headers=doctor)  # agrees default True
    assert r.json()["agrees"] is True

    detail = client.get(f"/doctor/assessments/{aid}", headers=doctor).json()
    assert [x["agrees"] for x in detail["predictions"][0]["reviews"]] == [False, True]
    mine = client.get(f"/assessments/{aid}", headers=p["headers"]).json()
    assert [x["agrees"] for x in mine["predictions"][0]["reviews"]] == [False, True]


def test_admin_creates_user(client, make_user):
    admin = make_user("riya@gmail.com", role="admin")
    patient = make_user("aman@gmail.com")
    body = {"name": "Dr Rao", "email": "rao@gmail.com", "password": "password123", "role": "doctor"}

    assert client.post("/admin/users", json=body, headers=patient).status_code == 403
    r = client.post("/admin/users", json=body, headers=admin)
    assert r.status_code == 201 and r.json()["role"] == "doctor"
    assert "password" not in r.json() and "password_hash" not in r.json()

    assert client.post("/admin/users", json=body, headers=admin).status_code == 400
    bad_role = {**body, "email": "x@gmail.com", "role": "superuser"}
    assert client.post("/admin/users", json=bad_role, headers=admin).status_code == 422

    login = client.post("/login", data={"username": "rao@gmail.com", "password": "password123"})
    assert login.status_code == 200


def test_admin_changes_role(client, make_user):
    admin = make_user("riya@gmail.com", role="admin")
    user = make_user("sara@gmail.com")
    uid = client.get("/me", headers=user).json()["id"]
    my_id = client.get("/me", headers=admin).json()["id"]

    assert client.put(f"/admin/users/{uid}/role", json={"role": "doctor"}, headers=user).status_code == 403
    r = client.put(f"/admin/users/{uid}/role", json={"role": "doctor"}, headers=admin)
    assert r.status_code == 200 and r.json()["role"] == "doctor"
    assert client.get("/admin/users", headers=user).status_code == 403  # doctor, admin nahi
    assert client.get("/doctor/assessments", headers=user).status_code == 200

    assert client.put(f"/admin/users/{my_id}/role", json={"role": "patient"}, headers=admin).status_code == 400
    assert client.put(f"/admin/users/{uid}/role", json={"role": "boss"}, headers=admin).status_code == 422
    assert client.put("/admin/users/9999/role", json={"role": "doctor"}, headers=admin).status_code == 404


# ---------- Member 3 ki real service ka format ----------

def test_predict_accepts_real_ai_service_format(client, patient_with_image, monkeypatch):
    def real_format(image_bytes, filename, content_type, include_heatmap=False):
        return {
            "predicted_category": "Medium",
            "model_scores": {"Small": 0.2, "Medium": 0.7, "Large": 0.1},
            "model_version": "hybrid-fetal-hc-v1.0.0",
            "pixel_size_mm": 0.128,
            "inference_ms": 41.5,
            "heatmap_base64": None,
        }

    monkeypatch.setattr(main, "call_ai_service", real_format)
    p = patient_with_image
    r = client.post(f"/assessments/{p['assessment_id']}/predict", headers=p["headers"])
    assert r.status_code == 201
    assert r.json()["predicted_class"] == "Medium"
    assert r.json()["probabilities"]["Medium"] == 0.7
    assert r.json()["model_version"] == "hybrid-fetal-hc-v1.0.0"


def test_predict_rejects_unexpected_ai_response(client, patient_with_image, monkeypatch):
    monkeypatch.setattr(main, "call_ai_service", lambda *a, **k: {"hello": "world"})
    p = patient_with_image
    r = client.post(f"/assessments/{p['assessment_id']}/predict", headers=p["headers"])
    assert r.status_code == 502


# ---------- Heatmap ----------

def _predict(client, p, heatmap):
    url = f"/assessments/{p['assessment_id']}/predict"
    if heatmap:
        url += "?heatmap=true"
    return client.post(url, headers=p["headers"])


def test_predict_without_heatmap_by_default(client, patient_with_image):
    p = patient_with_image
    r = _predict(client, p, heatmap=False)
    assert r.status_code == 201
    assert r.json()["has_heatmap"] is False
    assert list(main.UPLOAD_DIR.glob("*_heatmap.png")) == []
    pred_id = r.json()["id"]
    assert client.post(f"/predictions/{pred_id}/heatmap/link", headers=p["headers"]).status_code == 404


def test_heatmap_saved_privately_and_served_by_link(client, make_user, patient_with_image):
    p = patient_with_image
    r = _predict(client, p, heatmap=True)
    assert r.status_code == 201
    body = r.json()
    assert body["has_heatmap"] is True and "heatmap_note" in body
    assert len(list(main.UPLOAD_DIR.glob("*_heatmap.png"))) == 1

    pred_id = body["id"]
    link = client.post(f"/predictions/{pred_id}/heatmap/link", headers=p["headers"])
    assert link.status_code == 200
    img = client.get(link.json()["url"])  # bina login ke
    assert img.status_code == 200
    assert img.headers["content-type"] == "image/png"
    assert img.content.startswith(b"\x89PNG")

    # list aur detail mein flag dikhta hai
    mine = client.get("/assessments", headers=p["headers"]).json()[0]
    assert mine["has_heatmap"] is True and mine["prediction_id"] == pred_id
    detail = client.get(f"/assessments/{p['assessment_id']}", headers=p["headers"]).json()
    assert detail["predictions"][0]["has_heatmap"] is True

    # doctor link bana sakta hai, dusra patient nahi
    doctor = make_user("dr@gmail.com", role="doctor")
    assert client.post(f"/predictions/{pred_id}/heatmap/link", headers=doctor).status_code == 200
    other = make_user("sara@gmail.com")
    assert client.post(f"/predictions/{pred_id}/heatmap/link", headers=other).status_code == 404
    assert client.post(f"/predictions/{pred_id}/heatmap/link").status_code == 401
    drow = client.get("/doctor/assessments", headers=doctor).json()[0]
    assert drow["has_heatmap"] is True


def test_heatmap_link_rejects_wrong_tokens(client, patient_with_image):
    p = patient_with_image
    pred_id = _predict(client, p, heatmap=True).json()["id"]
    url = client.post(f"/predictions/{pred_id}/heatmap/link", headers=p["headers"]).json()["url"]

    i = len(url) - 10
    changed = "A" if url[i] != "A" else "B"
    assert client.get(url[:i] + changed + url[i + 1:]).status_code == 401

    login_token = p["headers"]["Authorization"].split(" ")[1]
    assert client.get(f"/heatmap-links/{login_token}").status_code == 401

    image_url = client.post(f"/images/{p['image_id']}/link", headers=p["headers"]).json()["url"]
    assert client.get("/heatmap-links/" + image_url.split("/")[-1]).status_code == 401


def test_bad_heatmap_from_ai_is_ignored(client, patient_with_image, monkeypatch):
    def bad(image_bytes, filename, content_type, include_heatmap=False):
        return {
            "predicted_category": "Small",
            "model_scores": {"Small": 0.9, "Medium": 0.05, "Large": 0.05},
            "model_version": "v",
            "heatmap_base64": "not-valid-base64!!",
        }

    monkeypatch.setattr(main, "call_ai_service", bad)
    p = patient_with_image
    r = _predict(client, p, heatmap=True)
    assert r.status_code == 201
    assert r.json()["has_heatmap"] is False
    assert "heatmap_message" in r.json()
    assert list(main.UPLOAD_DIR.glob("*_heatmap.png")) == []


def test_heatmap_flag_is_forwarded_to_ai_service(client, patient_with_image, monkeypatch):
    seen = []

    def spy(image_bytes, filename, content_type, include_heatmap=False):
        seen.append(include_heatmap)
        return {"predicted_category": "Small", "model_scores": {"Small": 1.0}, "model_version": "v", "heatmap_base64": None}

    monkeypatch.setattr(main, "call_ai_service", spy)
    p = patient_with_image
    _predict(client, p, heatmap=False)
    _predict(client, p, heatmap=True)
    assert seen == [False, True]