from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from flask_jwt_extended import JWTManager
from functools import wraps
from flask_jwt_extended import jwt_required, get_jwt_identity

from backend.models import db, Category, Brand, Product, ProductVariant, InventoryBatch, User
from backend.interpretar import interpretar_mensaje, ErrorIA
from backend.ejecutar import ejecutar_accion
from backend.auth import auth_bp

import os
import re
import time

# Cargar SIEMPRE el .env que está junto a este archivo (backend/.env),
# sin importar desde qué carpeta se ejecute el servidor.
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

app = Flask(__name__)
CORS(app)

# Configurar JWT (clave de al menos 32 bytes para SHA256)
app.config["JWT_SECRET_KEY"] = os.environ.get(
    "JWT_SECRET_KEY", "dev-only-cambia-esta-clave-en-produccion"
)
jwt = JWTManager(app)

# Registrar rutas de autenticaci�n (una sola vez)
app.register_blueprint(auth_bp)

app.config["SQLALCHEMY_DATABASE_URI"] = os.environ.get("DATABASE_URL")
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

# Configuración del pool de conexiones (importante para Supabase pooler y producción)
engine_options = {
    "pool_size": 5,
    "max_overflow": 10,
    "pool_timeout": 30,
    "pool_recycle": 1800,
    "pool_pre_ping": True,
}

# pg8000 necesita un contexto SSL explícito para PostgreSQL/Supabase.
if (os.environ.get("DATABASE_URL") or "").startswith("postgresql+pg8000"):
    import ssl

    engine_options["connect_args"] = {"ssl_context": ssl.create_default_context()}

app.config["SQLALCHEMY_ENGINE_OPTIONS"] = engine_options

db.init_app(app)

with app.app_context():
    db.create_all()


def generar_sku(producto, variante):
    categoria = (producto.category.name if producto.category else "GEN").upper()
    nombre = (producto.name or "").replace(" ", "").upper()
    marca = (variante.brand.name if variante.brand else "GEN").replace(" ", "").upper()
    variedad = (variante.type_variety or "").replace(" ", "").upper()
    contenido_valor = str(variante.content_value or "")
    contenido_unidad = str(variante.content_unit or "")
    contenido = f"{contenido_valor}{contenido_unidad}".upper()

    return f"{categoria}-{nombre}-{marca}-{variedad}-{contenido}"


def rol_requerido(*roles_permitidos):
    def decorator(fn):
        @wraps(fn)
        @jwt_required()
        def wrapper(*args, **kwargs):
            user_id = get_jwt_identity()
            user = User.query.get(user_id)
            if not user or user.role not in roles_permitidos:
                return jsonify({"error": "No tienes permisos para esta acci�n"}), 403
            return fn(*args, **kwargs)
        return wrapper
    return decorator


@app.route("/api/inventario", methods=["GET"])
@rol_requerido("super_admin", "admin", "user")
def inventario():
    try:
        productos = Product.query.all()
        resultado = []

        for p in productos:
            producto_json = {
                "id": p.id,
                "name": p.name,
                "category": p.category.name if p.category else None,
                "variants": []
            }

            for v in p.variants:
                lotes = InventoryBatch.query.filter_by(variant_id=v.id).all()
                total = sum(l.quantity for l in lotes)

                variante_json = {
                    "variant_id": v.id,
                    "brand": v.brand.name if v.brand else None,
                    "type_variety": v.type_variety,
                    "content_value": v.content_value,
                    "content_unit": v.content_unit,
                    "sku_code": v.sku_code,
                    "total_quantity": total,
                    "batches": [
                        {
                            "id": l.id,
                            "quantity": l.quantity,
                            "arrival_date": l.arrival_date.strftime("%Y-%m-%d"),
                            "expiration_date": (
                                l.expiration_date.strftime("%Y-%m-%d")
                                if l.expiration_date else None
                            )
                        }
                        for l in lotes
                    ]
                }

                producto_json["variants"].append(variante_json)

            resultado.append(producto_json)

        return jsonify({"productos": resultado})

    except Exception as e:
        print("Error en /api/inventario:", e)
        return jsonify({"error": "Error obteniendo inventario"}), 500


def parsear_contenido(valor_raw, unidad_raw):
    """
    Convierte content_value a float y separa unidad si viene junto.
    Ej: valor_raw="200gr", unidad_raw="" -> (200.0, "gr")
    """
    valor = None
    unidad = (unidad_raw or "").strip() or None

    if valor_raw is None or valor_raw == "":
        return None, unidad

    texto = str(valor_raw).strip()

    # Si el usuario escribió todo junto (ej: "200gr"), separar valor y unidad
    match = re.match(r"^([\d\.]+)\s*([a-zA-Z]*)$", texto)
    if match:
        try:
            valor = float(match.group(1))
        except ValueError:
            valor = None
        if match.group(2):
            unidad = match.group(2)
    else:
        try:
            valor = float(texto)
        except ValueError:
            valor = None

    return valor, unidad


@app.route("/api/editar_variante/<int:variant_id>", methods=["PUT"])
@rol_requerido("super_admin", "admin")
def editar_variante(variant_id):
    try:
        data = request.get_json()

        variante = ProductVariant.query.get(variant_id)
        if not variante:
            return jsonify({"error": "Variante no encontrada"}), 404

        producto = Product.query.get(variante.product_id)
        regenerar_sku = False

        if "product_name" in data:
            producto.name = data["product_name"]
            regenerar_sku = True

        if "category" in data:
            category_name = data["category"].strip()
            category = Category.query.filter_by(name=category_name).first()
            if not category:
                category = Category(name=category_name)
                db.session.add(category)
            producto.category = category
            regenerar_sku = True

        if "brand" in data:
            brand_name = data["brand"].strip()
            brand = Brand.query.filter_by(name=brand_name).first()
            if not brand:
                brand = Brand(name=brand_name)
                db.session.add(brand)
            variante.brand = brand
            regenerar_sku = True

        if "type_variety" in data:
            variante.type_variety = data["type_variety"]
            regenerar_sku = True

        # Manejo seguro de content_value y content_unit
        if "content_value" in data or "content_unit" in data:
            valor_actual = variante.content_value
            unidad_actual = variante.content_unit

            valor_nuevo, unidad_nueva = parsear_contenido(
                data.get("content_value", valor_actual),
                data.get("content_unit", unidad_actual)
            )

            if valor_nuevo is not None:
                variante.content_value = valor_nuevo
            if unidad_nueva is not None:
                variante.content_unit = unidad_nueva

            regenerar_sku = True

        if regenerar_sku:
            variante.sku_code = generar_sku(producto, variante)

        db.session.commit()

        return jsonify({
            "mensaje": "Variante actualizada correctamente",
            "sku": variante.sku_code
        })

    except Exception as e:
        print("Error en /api/editar_variante:", e)
        return jsonify({"error": "Error editando variante"}), 500


@app.route("/asistente_ia", methods=["POST"])
@rol_requerido("super_admin", "admin", "user")
def asistente_ia():
    try:
        data = request.get_json()
        mensaje = data.get("mensaje", "")
        contexto = data.get("contexto", "")

        if not mensaje:
            return jsonify({"respuesta": "No recib� ning�n mensaje."})

        try:
            accion = interpretar_mensaje(mensaje, contexto=contexto)
        except ErrorIA as e:
            print("Error de la IA:", e)
            return jsonify({
                "respuesta": (
                    "No pude conectar con el servicio de IA. "
                    "Revisa que IA_API_KEY en backend/.env sea válida y que "
                    "el modelo configurado esté disponible."
                )
            }), 502
        except Exception as e:
            print("Error interpretando mensaje:", e)
            return jsonify({"respuesta": "No pude interpretar tu mensaje."}), 500

        if not isinstance(accion, dict):
            return jsonify({"respuesta": "La IA devolvi� un formato inesperado."})

        try:
            resultado = ejecutar_accion(accion)
        except Exception as e:
            print("Error ejecutando acci�n:", e)
            return jsonify({"respuesta": "Ocurri� un error ejecutando la acci�n."})

        time.sleep(0.2)

        return jsonify({"respuesta": resultado})

    except Exception as e:
        print("Error en /asistente_ia:", e)
        return jsonify({"respuesta": "Ocurri� un error procesando tu solicitud."}), 500


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "inventario_app"}), 200


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    app.run(host="0.0.0.0", port=port)