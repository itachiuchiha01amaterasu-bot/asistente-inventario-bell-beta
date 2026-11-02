"""Crea las tablas y el super_admin en la base indicada por DATABASE_URL.

Uso (desde la raíz del proyecto):

    source backend/venv/bin/activate
    read -rsp "Pega la URL de la BD: " DBURL; echo
    DATABASE_URL="$DBURL" ADMIN_PASSWORD="una-clave-fuerte" python -m backend.inicializar_bd

Variables opcionales:
    ADMIN_USERNAME  (por defecto: admin)
    ADMIN_EMAIL     (por defecto: admin@inventario.local)
    ADMIN_PASSWORD  (obligatoria para crear/actualizar el super_admin)
"""
import os
import sys

# Asegurar que se puede importar desde backend/
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from backend.app import app  # noqa: E402  (también ejecuta db.create_all())
from backend.models import db, User  # noqa: E402


def main():
    with app.app_context():
        url = db.engine.url.render_as_string(hide_password=True)
        print(f"Base de datos: {url}")

        db.create_all()
        print("✓ Tablas creadas/verificadas")

        username = os.environ.get("ADMIN_USERNAME", "admin")
        email = os.environ.get("ADMIN_EMAIL", "admin@inventario.local")
        password = os.environ.get("ADMIN_PASSWORD")

        if not password:
            print(
                "⚠️  No se definió ADMIN_PASSWORD: no se creó/actualizó ningún usuario.\n"
                "    Vuelve a ejecutar con ADMIN_PASSWORD=\"tu-clave-fuerte\"."
            )
            return 0

        if len(password) < 8:
            print("✗ ADMIN_PASSWORD debe tener al menos 8 caracteres.")
            return 1

        user = User.query.filter_by(username=username).first()
        if user:
            user.email = email
            user.role = "super_admin"
            user.set_password(password)
            print(f"✓ Contraseña actualizada para el super_admin '{username}'")
        else:
            user = User(username=username, email=email, role="super_admin")
            user.set_password(password)
            db.session.add(user)
            print(f"✓ super_admin creado: '{username}' ({email})")

        db.session.commit()
        print("✓ Listo. Ya puedes iniciar sesión con ese usuario.")
        return 0


if __name__ == "__main__":
    sys.exit(main())
