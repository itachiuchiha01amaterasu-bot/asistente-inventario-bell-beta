"""Script para crear el usuario super_admin inicial."""
import os
import sys

# Asegurar que se puede importar desde backend/
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from backend.models import db, User
from backend.app import app

with app.app_context():
    # Verificar si ya existe un super_admin
    admin = User.query.filter_by(role="super_admin").first()
    if admin:
        print(f"Ya existe un super_admin: {admin.username} (id={admin.id})")
    else:
        # Crear super_admin inicial
        super_admin = User(
            username="admin",
            email="admin@inventario.local",
            role="super_admin",
        )
        super_admin.set_password("admin123")  # Cambia esta contraseña en producción
        db.session.add(super_admin)
        db.session.commit()
        print("✓ Super admin creado:")
        print(f"  Usuario: admin")
        print(f"  Contraseña: admin123")
        print(f"  Rol: super_admin")
        print("⚠️  Cambia la contraseña después del primer inicio de sesión.")
