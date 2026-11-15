"""Crea una cuenta (admin por defecto) en la base indicada por DATABASE_URL.

Uso recomendado (desde la raíz del proyecto):

    source backend/venv/bin/activate
    read -rsp "Pega la URL de la base: " DBURL; echo
    DATABASE_URL="$DBURL" python3 -m backend.crear_usuario

Te pedirá usuario, correo y contraseña. La contraseña no se muestra al
escribirla y nunca se guarda en texto: solo su hash.

También puedes pasarlo todo por variables de entorno:

    USUARIO=maria CORREO=maria@bell.com ROL=admin \
    CLAVE='una-clave-larga' DATABASE_URL="$DBURL" \
    python3 -m backend.crear_usuario
"""
import getpass
import os
import sys

# La URL se exige ANTES de importar la app: así el script nunca cae por
# error en la base local definida en backend/.env.
URL_BASE = os.environ.get("DATABASE_URL")

if not URL_BASE:
    print("✗ Falta DATABASE_URL.")
    print("  Así se ejecuta (la URL no se guarda en el historial):")
    print('    read -rsp "Pega la URL de la base: " DBURL; echo')
    print('    DATABASE_URL="$DBURL" python3 -m backend.crear_usuario')
    sys.exit(1)

# Permitir ejecutar desde la raíz del proyecto.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from backend.app import app  # noqa: E402  (también ejecuta db.create_all())
from backend.models import db, User  # noqa: E402

ROLES_VALIDOS = ("admin", "super_admin", "user")


def _pedir(nombre, variable, oculto=False, por_defecto=None):
    valor = os.environ.get(variable)
    if valor:
        return valor.strip() if not oculto else valor

    try:
        if oculto:
            return getpass.getpass(nombre)

        return input(nombre).strip() or (por_defecto or "")
    except (EOFError, KeyboardInterrupt):
        if por_defecto is not None:
            return por_defecto
        print("\n✗ Cancelado.")
        sys.exit(1)


def main():
    with app.app_context():
        url = db.engine.url.render_as_string(hide_password=True)
        print(f"Base de datos: {url}")

        db.create_all()
        print("✓ Tablas verificadas")

        usuario = _pedir("Usuario: ", "USUARIO")
        correo = _pedir("Correo: ", "CORREO").lower()

        rol = (
            _pedir("Rol [admin]: ", "ROL", por_defecto="admin") or "admin"
        ).lower()

        clave = _pedir("Contraseña (mínimo 8): ", "CLAVE", oculto=True)
        if not os.environ.get("CLAVE"):
            repetir = _pedir("Repite la contraseña: ", "CLAVE_REPETIR", oculto=True)
            if clave != repetir:
                print("✗ Las contraseñas no coinciden.")
                return 1

        if not usuario:
            print("✗ El usuario es obligatorio.")
            return 1

        if not correo or "@" not in correo or "." not in correo.split("@")[-1]:
            print("✗ Escribe un correo válido.")
            return 1

        if len(clave) < 8 or not clave.strip():
            print("✗ La contraseña debe tener al menos 8 caracteres.")
            return 1

        if rol not in ROLES_VALIDOS:
            print(f"✗ Rol inválido. Usa uno de: {', '.join(ROLES_VALIDOS)}")
            return 1

        if User.query.filter_by(username=usuario).first():
            print(f"✗ Ya existe el usuario '{usuario}'. No se cambió nada.")
            print("  Si quieres cambiarle la contraseña, usa backend.inicializar_bd.")
            return 1

        if User.query.filter_by(email=correo).first():
            print(f"✗ El correo '{correo}' ya está registrado. No se cambió nada.")
            return 1

        nuevo = User(username=usuario, email=correo, role=rol)
        nuevo.set_password(clave)
        db.session.add(nuevo)
        db.session.commit()

        print(
            f"✓ Cuenta creada: {usuario} ({correo}) "
            f"con rol '{rol}'. Ya puede iniciar sesión."
        )
        return 0


if __name__ == "__main__":
    sys.exit(main())
