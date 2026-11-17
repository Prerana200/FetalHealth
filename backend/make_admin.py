from database import SessionLocal
import models

EMAIL = "admin@example.com"  # jis user ko admin banana hai

db = SessionLocal()
user = db.query(models.User).filter(models.User.email == EMAIL).first()

if user:
    user.role = "doctor"
    db.commit()
    print(f"{user.email} is now doctor")
else:
    print("User not found")

db.close()