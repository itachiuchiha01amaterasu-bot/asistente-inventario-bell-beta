from flask import Blueprint, request, jsonify
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    jwt_required,
    get_jwt_identity,
    decode_token,
)
from backend.models import db, User
from backend.seguridad import (
    crear_captcha,
    validar_captcha,
    permitir_intento_login,
    registrar_fallo_login,
    limpiar_fallos_login,
)

import hashlib
from datetime import timedelta

auth_bp = Blueprint("auth", __name__)


def _ip_cliente():
    reenviada = request.headers.get("X-Forwarded-For", "")
    if reenviada:
        return reenviada.split(",")[0].strip()
    return request.remote_addr or "desconocida"


# -----------------------------
# REGISTRO PÚBLICO (cualquiera puede crear cuenta como "user")
# -----------------------------
@auth_bp.route("/api/auth/register", methods=["POST"])
def register():
    data = request.get_json()
    username = data.get("username")
    email = data.get("email")
    password = data.get("password")
    role = data.get("role", "user")  # por defecto es usuario normal

    if not username or not email or not password:
        return jsonify({"error": "Faltan campos requeridos"}), 400

    if User.query.filter_by(username=username).first():
        return jsonify({"error": "El usuario ya existe"}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({"error": "El correo ya está registrado"}), 400

    # Solo super_admin puede crear otros admin
    if role in ["admin", "super_admin"]:
        return jsonify({"error": "No tienes permisos para crear este rol"}), 403

    new_user = User(username=username, email=email, role=role)
    new_user.set_password(password)
    db.session.add(new_user)
    db.session.commit()

    return jsonify({
        "mensaje": "Usuario creado correctamente",
        "usuario": new_user.to_dict()
    }), 201


# -----------------------------
# CAPTCHA DE SUMA Y RESTA
# -----------------------------
@auth_bp.route("/api/auth/captcha", methods=["GET"])
def captcha():
    return jsonify(crear_captcha()), 200


# -----------------------------
# LOGIN
# -----------------------------
@auth_bp.route("/api/auth/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    username = data.get("username")
    password = data.get("password")
    captcha_id = data.get("captcha_id")
    captcha_respuesta = data.get("captcha_respuesta")

    if not username or not password:
        return jsonify({"error": "Usuario y contraseña requeridos"}), 400

    # La verificación se hace aquí, en el servidor: no basta con ocultarla
    # en el navegador.
    if not validar_captcha(captcha_id, captcha_respuesta):
        return jsonify({
            "error": "La verificación de suma o resta es incorrecta o venció",
            "codigo": "captcha",
        }), 400

    ip = _ip_cliente()
    if not permitir_intento_login(ip):
        return jsonify({
            "error": "Demasiados intentos fallidos. Espera unos minutos.",
            "codigo": "limite",
        }), 429

    user = User.query.filter_by(username=username).first()
    if not user or not user.check_password(password):
        registrar_fallo_login(ip)
        return jsonify({
            "error": "Credenciales inválidas",
            "codigo": "credenciales",
        }), 401

    limpiar_fallos_login(ip)

    access_token = create_access_token(identity=str(user.id))
    return jsonify({
        "access_token": access_token,
        "usuario": user.to_dict()
    }), 200


# -----------------------------
# LOGOUT
# -----------------------------
@auth_bp.route("/api/auth/logout", methods=["POST"])
@jwt_required()
def logout():
    return jsonify({"mensaje": "Sesión cerrada"}), 200


# -----------------------------
# PERFIL DEL USUARIO
# -----------------------------
@auth_bp.route("/api/auth/me", methods=["GET"])
@jwt_required()
def me():
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "Usuario no encontrado"}), 404
    return jsonify({"usuario": user.to_dict()}), 200


# -----------------------------
# CREAR USUARIOS (solo super_admin)
# -----------------------------
@auth_bp.route("/api/auth/users", methods=["POST"])
@jwt_required()
def crear_usuario():
    current_user_id = get_jwt_identity()
    current_user = User.query.get(current_user_id)

    if current_user.role != "super_admin":
        return jsonify({"error": "Solo super_admin puede crear usuarios"}), 403

    data = request.get_json()
    username = data.get("username")
    email = data.get("email")
    password = data.get("password")
    role = data.get("role", "user")

    if not username or not email or not password:
        return jsonify({"error": "Faltan campos requeridos"}), 400

    if User.query.filter_by(username=username).first():
        return jsonify({"error": "El usuario ya existe"}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({"error": "El correo ya está registrado"}), 400

    new_user = User(username=username, email=email, role=role)
    new_user.set_password(password)
    db.session.add(new_user)
    db.session.commit()

    return jsonify({
        "mensaje": "Usuario creado correctamente",
        "usuario": new_user.to_dict()
    }), 201


# -----------------------------
# RECUPERAR CONTRASEÑA (paso 1: verificar usuario y correo)
# -----------------------------
def _huella_password(user):
    """Huella corta del hash actual: invalida el token cuando cambia la clave."""
    return hashlib.sha256(user.password_hash.encode()).hexdigest()[:16]


@auth_bp.route("/api/auth/recuperar", methods=["POST"])
def recuperar_password():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    email = (data.get("email") or "").strip().lower()

    if not username or not email:
        return jsonify({"error": "Escribe tu usuario y tu correo"}), 400

    user = User.query.filter_by(username=username).first()

    if not user or (user.email or "").lower() != email:
        return jsonify({
            "error": "El usuario y el correo no coinciden con ninguna cuenta"
        }), 404

    # Token temporal y de un solo uso. Se emite como "refresh" para que
    # jwt_required() no lo acepte como sesión normal de la API.
    reset_token = create_refresh_token(
        identity=str(user.id),
        additional_claims={
            "tipo": "recuperacion",
            "huella": _huella_password(user),
        },
        expires_delta=timedelta(minutes=15),
    )

    return jsonify({
        "mensaje": "Datos verificados. Escribe tu nueva contraseña.",
        "reset_token": reset_token,
    }), 200


# -----------------------------
# RECUPERAR CONTRASEÑA (paso 2: guardar la contraseña nueva)
# -----------------------------
@auth_bp.route("/api/auth/restablecer", methods=["POST"])
def restablecer_password():
    data = request.get_json(silent=True) or {}
    reset_token = data.get("token")
    password = data.get("password")

    if not reset_token or not password:
        return jsonify({"error": "Faltan datos para cambiar la contraseña"}), 400

    if len(password) < 8:
        return jsonify({
            "error": "La contraseña debe tener al menos 8 caracteres"
        }), 400

    try:
        datos = decode_token(reset_token)
    except Exception:
        return jsonify({
            "error": "El enlace de recuperación no es válido o ya venció"
        }), 400

    if datos.get("tipo") != "recuperacion":
        return jsonify({"error": "El enlace de recuperación no es válido"}), 400

    user = User.query.get(datos.get("sub"))
    if not user:
        return jsonify({"error": "Usuario no encontrado"}), 404

    # Si la contraseña ya cambió, el token deja de servir (un solo uso).
    if datos.get("huella") != _huella_password(user):
        return jsonify({
            "error": "Este enlace ya fue usado. Solicita uno nuevo."
        }), 400

    if user.check_password(password):
        return jsonify({
            "error": "La contraseña nueva debe ser diferente a la actual"
        }), 400

    user.set_password(password)
    db.session.commit()

    return jsonify({"mensaje": "Contraseña actualizada correctamente"}), 200
