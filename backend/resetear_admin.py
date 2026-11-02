"""Restablece la contraseña del super_admin existente."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from backend.models import db, User
from backend.app import app

with app.app_context():
    admin = User.query.filter_by(username="admin").first()
    if admin:
        admin.set_password("admin123")
        db.session.commit()
        print(f"✓ Contraseña restablecida para super_admin '{admin.username}'")
        print(f"  Contraseña nueva: admin123")
        print(f"  Rol: {admin.role}")
    else:
        print("✗ No se encontró el usuario admin")
