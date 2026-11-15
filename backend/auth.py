from flask import Blueprint, request, jsonify
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    jwt_required,
    get_jwt_identity,
    decode_token,
)
from backend.models import db, User, PasswordResetCode
from backend.correo import ErrorCorreo, enviar_codigo
from backend.seguridad import (
    crear_captcha,
    validar_captcha,
    permitir_intento_login,
    registrar_fallo_login,
    limpiar_fallos_login,
)

import hashlib
import secrets
from datetime import datetime, timedelta
from werkzeug.security import generate_password_hash, check_password_hash

auth_bp = Blueprint("auth", __name__)

# Recuperación por código
_CODIGO_MINUTOS = 10
_MAX_INTENTOS_CODIGO = 5
_ESPERA_REENVIO = 60
_MAX_CODIGOS_HORA = 5


def _ip_cliente():
    reenviada = request.headers.get("X-Forwarded-For", "")
    if reenviada:
        return reenviada.split(",")[0].strip()
    return request.remote_addr or "desconocida"


def _ocultar_correo(correo):
    """jose@bell.com -> jo**@bell.com"""
    if "@" not in correo:
        return correo
    usuario, dominio = correo.split("@", 1)
    visible = usuario[:2] if len(usuario) > 2 else usuario[:1]
    return f"{visible}***@{dominio}"


# -----------------------------
# REGISTRO P�BLICO (cualquiera puede crear cuenta como "user")
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
        return jsonify({"error": "El correo ya est� registrado"}), 400

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
    return jsonify({"mensaje": "Sesi�n cerrada"}), 200


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
        return jsonify({"error": "El correo ya est� registrado"}), 400

    new_user = User(username=username, email=email, role=role)
    new_user.set_password(password)
    db.session.add(new_user)
    db.session.commit()

    return jsonify({
        "mensaje": "Usuario creado correctamente",
        "usuario": new_user.to_dict()
    }), 201


# -----------------------------
# RECUPERAR CONTRASEÑA (paso 1: enviar código al correo)
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

    # Se verifica que la cuenta exista y que el correo sea el suyo.
    if not user or (user.email or "").lower() != email:
        return jsonify({
            "error": "El usuario y el correo no coinciden con ninguna cuenta"
        }), 404

    ahora = datetime.utcnow()

    ultimo = (
        PasswordResetCode.query
        .filter_by(user_id=user.id)
        .order_by(PasswordResetCode.id.desc())
        .first()
    )

    if ultimo and (ahora - ultimo.created_at).total_seconds() < _ESPERA_REENVIO:
        restante = _ESPERA_REENVIO - int(
            (ahora - ultimo.created_at).total_seconds()
        )
        return jsonify({
            "error": f"Espera {restante} segundos antes de pedir otro código",
            "reintentar_en": max(restante, 1),
        }), 429

    recientes = PasswordResetCode.query.filter(
        PasswordResetCode.user_id == user.id,
        PasswordResetCode.created_at >= ahora - timedelta(hours=1),
    ).count()

    if recientes >= _MAX_CODIGOS_HORA:
        return jsonify({
            "error": "Pediste demasiados códigos. Intenta de nuevo en una hora."
        }), 429

    # Los códigos anteriores dejan de servir.
    PasswordResetCode.query.filter_by(
        user_id=user.id, used=False
    ).update({"used": True})

    codigo = f"{secrets.randbelow(1000000):06d}"
    registro = PasswordResetCode(
        user_id=user.id,
        code_hash=generate_password_hash(codigo),
        expires_at=ahora + timedelta(minutes=_CODIGO_MINUTOS),
    )
    db.session.add(registro)
    db.session.commit()

    try:
        enviar_codigo(user.email, codigo, user.username)
    except ErrorCorreo as e:
        print(f"Error enviando correo a {user.email}: {e}", flush=True)
        # Si no salió el correo, se borra el código para no bloquear el reenvío.
        db.session.delete(registro)
        db.session.commit()
        return jsonify({
            "error": (
                "No se pudo enviar el correo de recuperación. "
                "Revisa la configuración de correo del servidor."
            )
        }), 503

    return jsonify({
        "mensaje": (
            f"Enviamos un código de 6 dígitos a {_ocultar_correo(user.email)}"
        ),
        "expira_en_minutos": _CODIGO_MINUTOS,
        "reintentar_en": _ESPERA_REENVIO,
    }), 200


# -----------------------------
# RECUPERAR CONTRASEÑA (paso 2: verificar el código recibido)
# -----------------------------
@auth_bp.route("/api/auth/verificar-codigo", methods=["POST"])
def verificar_codigo():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    codigo = (data.get("codigo") or "").strip()

    if not username or not codigo:
        return jsonify({"error": "Escribe tu usuario y el código"}), 400

    user = User.query.filter_by(username=username).first()
    if not user:
        return jsonify({"error": "Usuario no encontrado"}), 404

    registro = (
        PasswordResetCode.query
        .filter_by(user_id=user.id, used=False)
        .order_by(PasswordResetCode.id.desc())
        .first()
    )

    if not registro:
        return jsonify({"error": "Solicita un código nuevo"}), 400

    if datetime.utcnow() > registro.expires_at:
        registro.used = True
        db.session.commit()
        return jsonify({"error": "El código venció. Solicita uno nuevo"}), 400

    if registro.attempts >= _MAX_INTENTOS_CODIGO:
        registro.used = True
        db.session.commit()
        return jsonify({
            "error": "Demasiados intentos con este código. Solicita uno nuevo"
        }), 429

    if not check_password_hash(registro.code_hash, codigo):
        registro.attempts += 1
        db.session.commit()
        return jsonify({"error": "El código es incorrecto"}), 400

    registro.used = True
    db.session.commit()

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
        "mensaje": "Código correcto. Escribe tu nueva contraseña.",
        "reset_token": reset_token,
    }), 200


# -----------------------------
# RECUPERAR CONTRASEÑA (paso 3: guardar la contraseña nueva)
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
