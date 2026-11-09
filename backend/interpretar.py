import json
import os
import re
import time
from datetime import datetime

from dotenv import load_dotenv
from openai import OpenAI

# Cargar siempre el .env que está junto a este archivo (backend/.env)
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))


class ErrorIA(Exception):
    """Error al comunicarse con el proveedor de IA (clave inválida, sin permisos, etc.)."""


# Proveedor compatible con la API de OpenAI (OpenRouter por defecto).
# También sirve para Groq, Ollama local, Mistral, DeepSeek, etc.
BASE_URL_IA = os.environ.get("IA_BASE_URL", "https://openrouter.ai/api/v1")
MODELO_IA = os.environ.get("IA_MODEL", "openrouter/free")

# Si el modelo principal devuelve 429/503 o tarda demasiado, se prueban estos en orden.
MODELOS_RESPALDO = [
    m.strip()
    for m in os.environ.get(
        "IA_FALLBACK_MODELS",
        "liquid/lfm-2.5-2.6b:free,nvidia/nemotron-3.5-lightning:free",
    ).split(",")
    if m.strip()
]

# Tiempo máximo por modelo. Si uno se cuelga, se pasa rápido al siguiente.
TIMEOUT_MODELO = float(os.environ.get("IA_TIMEOUT", "20"))

_client = None


def _get_client():
    """Crea el cliente de IA solo cuando se necesita, con mensaje claro si falta la clave."""
    global _client
    if _client is None:
        api_key = os.environ.get("IA_API_KEY") or os.environ.get("GROQ_API_KEY")
        if not api_key:
            raise ErrorIA("Falta IA_API_KEY en backend/.env")
        _client = OpenAI(
            api_key=api_key,
            base_url=BASE_URL_IA,
            timeout=TIMEOUT_MODELO,  # no colgar la petición si el proveedor no responde
            max_retries=0,           # el respaldo entre modelos se maneja abajo
            default_headers={
                "HTTP-Referer": "http://localhost:3000",
                "X-Title": "Inventario App - Bell IA",
            },
        )
    return _client

def interpretar_mensaje(mensaje: str, contexto: str = ""):
    hoy = datetime.now().strftime("%d-%m-%Y")
    texto = mensaje.lower().strip()

    fecha_regex = r"\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b"
    coincidencias = re.findall(fecha_regex, mensaje)
    for d, m, y in coincidencias:
        try:
            datetime(int(y), int(m), int(d))
        except:
            mensaje = mensaje.replace(f"{d}-{m}-{y}", "Por definir")

    if any(x in texto for x in ["ponle", "agrega", "añade"]) and "más" in texto:
        contexto += "\n[INTENCION_INFERIDA]: edit_quantity"

    if any(x in texto for x in ["cámbial", "cambia", "actualiza", "modifica", "edita"]):
        contexto += "\n[INTENCION_INFERIDA]: edit"

    if texto in ["sí", "ok", "dale", "ese", "esa", "el primero", "el segundo"]:
        contexto += "\n[INTENCION_INFERIDA]: select"

    if texto.startswith(("agrega", "añade", "añadir", "pon ", "ponle", "registra", "ingresa")):
        contexto += "\n[FORZAR_ACCION]: add"

    if "cambia el nombre" in texto or "renombra" in texto:
        contexto += "\n[CAMBIO_NOMBRE_PRODUCTO]"

    if "cambia el rubro" in texto or "cambia la categoría" in texto or "ponlo en la categoría" in texto:
        contexto += "\n[CAMBIO_CATEGORIA]"

    match_lote = re.search(r"lote\s*(#|\s*número\s*)?(\d+)", texto)
    lote_id_detectado = int(match_lote.group(2)) if match_lote else None

    prompt = f"""
Eres Bell, un asistente experto en inventario.
Tu única salida debe ser SIEMPRE un JSON válido.
Nunca escribas texto fuera del JSON.
Nunca expliques tu razonamiento.
Nunca agregues comentarios.
Nunca conviertas unidades.
Nunca escales cantidades.
Nunca interpretes equivalencias.
Nunca transformes 1 kg → 1000 g, ni 1 L → 1000 ml, ni 500 ml → 0.5 L.
Debes usar EXACTAMENTE el contenido que el usuario menciona.

Contrato JSON obligatorio:
{{
  "action": "add" | "edit" | "delete" | "query" | "select",
  "target": {{
    "product_name": null,
    "brand": null,
    "category": null,
    "type_variety": null,
    "content_value": null,
    "content_unit": null,
    "sku_code": null
  }},
  "batch": {{
    "quantity": 0,
    "arrival_date": "{hoy}",
    "expiration_date": "Por definir",
    "batch_id": null
  }},
  "changes": {{
    "field": null,
    "value": null,
    "extra": {{}}
  }},
  "option": null
}}

INTERPRETA ESTE MENSAJE:
{mensaje}

CONTEXTO:
{contexto}
"""

    try:
        # Intentar con el modelo principal y, si el proveedor lo rechaza
        # (429/503), probar automáticamente los modelos de respaldo.
        modelos = [MODELO_IA] + [m for m in MODELOS_RESPALDO if m != MODELO_IA]
        contenido = None
        ultimo_error = None

        for modelo in modelos:
            inicio_modelo = time.time()
            try:
                respuesta = _get_client().chat.completions.create(
                    model=modelo,
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.1,
                    timeout=TIMEOUT_MODELO,
                )
                contenido = (respuesta.choices[0].message.content or "").strip()
                if not contenido:
                    raise ValueError("Respuesta vacía del modelo")
                print(f"Modelo '{modelo}' respondió en {time.time() - inicio_modelo:.1f}s")
                break
            except Exception as e:
                ultimo_error = e
                print(
                    f"Modelo '{modelo}' falló tras "
                    f"{time.time() - inicio_modelo:.1f}s: {e}"
                )

        if contenido is None:
            raise ErrorIA(str(ultimo_error))

        inicio = contenido.find("{")
        fin = contenido.rfind("}")

        if inicio == -1 or fin == -1:
            raise ValueError("No se encontró JSON válido")

        contrato = json.loads(contenido[inicio:fin+1])

        contrato.setdefault("action", "query")
        contrato.setdefault("target", {})
        contrato.setdefault("batch", {
            "quantity": 0,
            "arrival_date": hoy,
            "expiration_date": "Por definir"
        })
        contrato.setdefault("changes", {})

        if lote_id_detectado:
            contrato["batch"]["batch_id"] = lote_id_detectado
            if contrato["action"] == "edit":
                contrato["changes"]["field"] = "batch_quantity"

        fecha = str(contrato["batch"].get("arrival_date", "")).strip()
        if "-" in fecha and len(fecha.split("-")[0]) == 4:
            contrato["batch"]["arrival_date"] = fecha
        else:
            try:
                d, m, y = fecha.split("-")
                contrato["batch"]["arrival_date"] = f"{y}-{m}-{d}"
            except:
                contrato["batch"]["arrival_date"] = hoy

        texto_original = mensaje.lower()
        # Buscar unidades como palabras completas para no confundir "integral"
        # (contiene "l ") con un litro.
        menciona_contenido = bool(
            re.search(
                r"\b(ml|mililitros?|litros?|l|kg|kilos?|kilogramos?|g|gramos?)\b",
                texto_original,
            )
        )

        if not menciona_contenido:
            contrato["target"]["content_value"] = None
            contrato["target"]["content_unit"] = None

        if contrato["target"].get("content_value") and contrato["target"].get("content_unit") is None:
            raw = str(contrato["target"]["content_value"])
            match = re.match(r"(\d+(?:\.\d+)?)([a-zA-Z]+)", raw)
            if match:
                contrato["target"]["content_value"] = match.group(1)
                contrato["target"]["content_unit"] = match.group(2)

        if not contrato["target"].get("product_name"):
            posibles = re.findall(r"[a-zA-Záéíóúñ]+", texto)
            blacklist = {
                "del", "de", "la", "el", "marca", "rubro", "variedad", "contenido",
                "kg", "g", "ml", "l", "unidades", "unidad", "ponle", "agrega",
                "añade", "ingresa", "registra", "cambia", "modifica", "actualiza",
                "quita", "elimina", "fecha", "vencimiento", "por", "definir"
            }
            for palabra in posibles:
                if palabra not in blacklist:
                    contrato["target"]["product_name"] = palabra
                    break

        pn = contrato["target"].get("product_name")
        if pn:
            pn = pn.lower()
            pn = pn.replace("marca", "")
            pn = pn.replace("del rubro", "")
            pn = pn.replace("rubro", "")
            pn = pn.replace("contenido", "")
            pn = pn.replace("variedad", "")
            pn = pn.replace("tipo", "")

            palabras = [p for p in re.findall(r"[a-záéíóúñ]+", pn) if p not in ["la", "el", "de", "del"]]
            if palabras:
                contrato["target"]["product_name"] = palabras[0].capitalize()

        if contrato["action"] == "delete":
            match_qty = re.search(r"(\d+)", mensaje)
            if match_qty:
                contrato["batch"]["quantity"] = int(match_qty.group(1))

        return contrato

    except Exception as e:
        print("Error interpretando mensaje:", e)
        # Propagamos el error para que la API pueda devolver un mensaje claro
        # (clave inválida, modelo no disponible, sin conexión, etc.)
        raise ErrorIA(str(e)) from e
