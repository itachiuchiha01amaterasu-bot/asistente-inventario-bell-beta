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
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    role = data.get("role", "user")  # por defecto es usuario normal

    if not username or not email or not password:
        return jsonify({"error": "Faltan campos requeridos"}), 400

    # La longitud se valida aquí, en el servidor: no basta con el atributo
    # minLength del navegador.
    if len(password) < 8 or not password.strip():
        return jsonify({
            "error": "La contraseña debe tener al menos 8 caracteres"
        }), 400

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
# GESTIÓN DE USUARIOS (solo super_admin)
# -----------------------------
ROLES_VALIDOS = ("user", "admin", "super_admin")


def _usuario_actual():
    """Devuelve el usuario del token o None si ya no existe."""
    return User.query.get(get_jwt_identity())


def _solo_super_admin():
    """Valida el rol; devuelve (usuario, respuesta de error o None)."""
    actual = _usuario_actual()

    if not actual:
        return None, (jsonify({"error": "Usuario no encontrado"}), 404)

    if actual.role != "super_admin":
        return None, (
            jsonify({"error": "Solo super_admin puede gestionar usuarios"}),
            403,
        )

    return actual, None


def _cantidad_super_admin():
    return User.query.filter_by(role="super_admin").count()


@auth_bp.route("/api/auth/users", methods=["GET"])
@jwt_required()
def listar_usuarios():
    _, error = _solo_super_admin()
    if error:
        return error

    usuarios = User.query.order_by(User.username.asc()).all()

    return jsonify({"usuarios": [u.to_dict() for u in usuarios]}), 200


@auth_bp.route("/api/auth/users", methods=["POST"])
@jwt_required()
def crear_usuario():
    _, error = _solo_super_admin()
    if error:
        return error

    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    role = data.get("role", "user")

    if not username or not email or not password:
        return jsonify({"error": "Faltan campos requeridos"}), 400

    # La longitud y el rol también se validan en el servidor.
    if len(password) < 8 or not password.strip():
        return jsonify({
            "error": "La contraseña debe tener al menos 8 caracteres"
        }), 400

    if role not in ROLES_VALIDOS:
        return jsonify({"error": "El rol indicado no es válido"}), 400

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


@auth_bp.route("/api/auth/users/<int:user_id>", methods=["PUT"])
@jwt_required()
def editar_usuario(user_id):
    actual, error = _solo_super_admin()
    if error:
        return error

    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "Usuario no encontrado"}), 404

    data = request.get_json(silent=True) or {}

    username = (data.get("username") or "").strip()
    email = (data.get("email") or "").strip().lower()
    role = data.get("role", user.role)
    password = data.get("password") or ""

    if not username or not email:
        return jsonify({"error": "Usuario y correo son obligatorios"}), 400

    if role not in ROLES_VALIDOS:
        return jsonify({"error": "El rol indicado no es válido"}), 400

    # No permitir que un super_admin se quite a sí mismo el rol: así nunca
    # puede dejar la sesión sin permisos por error.
    if user.id == actual.id and role != user.role:
        return jsonify({
            "error": "No puedes cambiar tu propio rol"
        }), 400

    # Tampoco se puede degradar al último super_admin que queda.
    if (
        user.role == "super_admin"
        and role != "super_admin"
        and _cantidad_super_admin() <= 1
    ):
        return jsonify({
            "error": "Debe existir al menos un super_admin"
        }), 400

    repetido = User.query.filter(
        User.username == username, User.id != user.id
    ).first()
    if repetido:
        return jsonify({"error": "El usuario ya existe"}), 400

    repetido_email = User.query.filter(
        User.email == email, User.id != user.id
    ).first()
    if repetido_email:
        return jsonify({"error": "El correo ya está registrado"}), 400

    if password:
        if len(password) < 8 or not password.strip():
            return jsonify({
                "error": "La contraseña debe tener al menos 8 caracteres"
            }), 400
        user.set_password(password)

    user.username = username
    user.email = email
    user.role = role
    db.session.commit()

    return jsonify({
        "mensaje": "Usuario actualizado correctamente",
        "usuario": user.to_dict()
    }), 200


@auth_bp.route("/api/auth/users/<int:user_id>", methods=["DELETE"])
@jwt_required()
def eliminar_usuario(user_id):
    actual, error = _solo_super_admin()
    if error:
        return error

    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "Usuario no encontrado"}), 404

    if user.id == actual.id:
        return jsonify({"error": "No puedes eliminar tu propia cuenta"}), 400

    if user.role == "super_admin" and _cantidad_super_admin() <= 1:
        return jsonify({"error": "Debe existir al menos un super_admin"}), 400

    db.session.delete(user)
    db.session.commit()

    return jsonify({"mensaje": "Usuario eliminado correctamente"}), 200


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
