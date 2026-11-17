
import argparse
import shutil
import sqlite3
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
DB = HERE / "app.db"
UPLOADS = HERE / "uploads_data"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model-version", help="scans whose prediction used this model version, e.g. mock-service-v1")
    ap.add_argument("--older-than-days", type=float, help="scans created more than this many days ago")
    ap.add_argument("--ids", help="comma-separated scan ids, e.g. 3,4")
    ap.add_argument("--pending", action="store_true", help="scans that have no prediction")
    ap.add_argument("--yes", action="store_true", help="really delete (without this it only previews)")
    a = ap.parse_args()

    if not (a.model_version or a.older_than_days is not None or a.ids or a.pending):
        sys.exit("Give at least one of --model-version, --older-than-days, --ids, --pending (see --help).")
    if not DB.exists():
        sys.exit(f"Cannot find {DB}. Run this from the backend folder.")

    con = sqlite3.connect(DB)
    con.execute("PRAGMA foreign_keys = OFF")
    rows = con.execute("SELECT id, user_id, status, created_at FROM assessments ORDER BY id").fetchall()

    chosen = []
    cutoff = None
    if a.older_than_days is not None:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=a.older_than_days)).strftime("%Y-%m-%d %H:%M:%S")
    wanted_ids = {int(x) for x in a.ids.split(",") if x.strip()} if a.ids else None

    for aid, uid, status, created in rows:
        preds = con.execute("SELECT model_version FROM predictions WHERE assessment_id=?", (aid,)).fetchall()
        if a.model_version and not any(p[0] == a.model_version for p in preds):
            continue
        if cutoff and not (created and str(created) < cutoff):
            continue
        if wanted_ids is not None and aid not in wanted_ids:
            continue
        if a.pending and preds:
            continue
        chosen.append((aid, uid, status, created, [p[0] for p in preds]))

    if not chosen:
        print("No scans match. Nothing to do.")
        return

    print(f"{len(chosen)} scan(s) match:")
    for aid, uid, status, created, versions in chosen:
        print(f"  scan {aid}  user {uid}  {status:9}  {str(created)[:19]}  model: {', '.join(versions) or '-'}")

    if not a.yes:
        print("\nPreview only. Add --yes to delete these (a backup of app.db is made first).")
        return

    backup = DB.with_name(f"app.db.bak-{datetime.now().strftime('%Y%m%d-%H%M%S')}")
    shutil.copy2(DB, backup)
    print(f"\nBackup saved: {backup.name}")

    files, counts = [], {"doctor_reviews": 0, "predictions": 0, "image_assets": 0, "assessments": 0}
    for aid, *_ in chosen:
        pred_ids = [r[0] for r in con.execute("SELECT id FROM predictions WHERE assessment_id=?", (aid,))]
        for pid in pred_ids:
            counts["doctor_reviews"] += con.execute("DELETE FROM doctor_reviews WHERE prediction_id=?", (pid,)).rowcount
        files += [r[0] for r in con.execute(
            "SELECT heatmap_name FROM predictions WHERE assessment_id=? AND heatmap_name IS NOT NULL", (aid,))]
        files += [r[0] for r in con.execute("SELECT stored_name FROM image_assets WHERE assessment_id=?", (aid,))]
        counts["predictions"] += con.execute("DELETE FROM predictions WHERE assessment_id=?", (aid,)).rowcount
        counts["image_assets"] += con.execute("DELETE FROM image_assets WHERE assessment_id=?", (aid,)).rowcount
        counts["assessments"] += con.execute("DELETE FROM assessments WHERE id=?", (aid,)).rowcount
    con.commit()

    broken = con.execute("PRAGMA foreign_key_check").fetchall()
    con.close()

    removed = 0
    for name in files:
        p = UPLOADS / name
        if p.is_file() and p.resolve().parent == UPLOADS.resolve():
            p.unlink()
            removed += 1

    print("Deleted:", ", ".join(f"{n} {k}" for k, n in counts.items()), f"and {removed} file(s) from uploads_data.")
    print("Database check:", "OK" if not broken else f"PROBLEM, restore {backup.name}: {broken[:3]}")


if __name__ == "__main__":
    main()