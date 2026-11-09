import json
import os
import re
import time
import unicodedata
from datetime import datetime

from dotenv import load_dotenv
from openai import OpenAI

# Cargar siempre el .env que está junto a este archivo (backend/.env)
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))


class ErrorIA(Exception):
    """Error al comunicarse con el proveedor de IA (clave inválida, sin permisos, etc.)."""


# -----------------------------
# Detección determinista de intención
# -----------------------------
# El modelo gratuito a veces clasifica una pregunta como "add"/"delete".
# Estas reglas mandan sobre la respuesta del modelo: una consulta nunca debe
# terminar bloqueada (ni ejecutar una escritura) por un error de clasificación.

_VERBOS_ESCRITURA = (
    ("delete", (
        "elimina", "eliminar", "borra", "borrar", "quita", "quitar",
        "remueve", "remover",
    )),
    ("edit", (
        "edita", "editar", "cambia", "cambiar", "actualiza", "actualizar",
        "modifica", "modificar", "renombra", "renombrar", "corrige", "corregir",
    )),
    ("add", (
        "agrega", "agregar", "anade", "anadir", "pon", "ponle", "registra",
        "registrar", "ingresa", "ingresar", "crea", "crear", "carga", "cargar",
    )),
)

_INICIOS_CONSULTA = (
    "cuanto", "cuanta", "cuantos", "cuantas", "que", "cual", "cuales",
    "dime", "muestra", "muestrame", "lista", "listar", "inventario",
    "stock", "disponible", "disponibles", "hay", "existe", "existen",
    "consulta", "consultar", "busca", "buscar", "ver", "estado",
)

_FRASES_CONSULTA = (
    "cuanto queda", "cuanto hay", "cuanto tiene", "cuantos hay",
    "cuantas hay", "que queda", "que hay", "stock de", "inventario de",
    "existencias de", "disponible de",
)


def _sin_acentos(texto):
    normalizado = unicodedata.normalize("NFD", texto)
    return "".join(c for c in normalizado if unicodedata.category(c) != "Mn")


def _normalizar_texto(texto):
    return _sin_acentos(str(texto or "").lower().strip())


def detectar_intencion(mensaje):
    """Devuelve 'query', 'add', 'edit', 'delete' o None según el texto.

    Es independiente del modelo: evita que una pregunta se clasifique como
    escritura y que una orden clara se clasifique como consulta.
    """
    texto = _normalizar_texto(mensaje)
    if not texto:
        return None

    primera = re.match(r"^([a-z]+)", texto)
    primera = primera.group(1) if primera else ""

    # "hay que agregar..." es una orden, no una consulta.
    if texto.startswith("hay que "):
        resto = texto[len("hay que "):]
        for accion, verbos in _VERBOS_ESCRITURA:
            if resto.startswith(verbos):
                return accion

    for accion, verbos in _VERBOS_ESCRITURA:
        if primera in verbos:
            # "agrega más leche" / "ponle más arroz" significa sumar stock
            # a una variante existente, no crear un producto nuevo.
            if accion == "add" and re.search(r"\bmas\b", texto):
                return "edit"
            return accion

    if primera in _INICIOS_CONSULTA:
        return "query"

    if any(frase in texto for frase in _FRASES_CONSULTA):
        return "query"

    return None


# -----------------------------
# Atajo local para consultas simples
# -----------------------------
# Estas consultas se responden sin llamar a la IA: son instantáneas y no
# consumen cuota. Si el texto no encaja, se usa el modelo como siempre.

_RE_CONSULTA = re.compile(
    r"^\s*(?:"
    r"(?:cuanto|cuanta|cuantos|cuantas)\s+(?:queda|quedan|hay|tiene|tienen|es|son)\s+(?:de\s+|del\s+|en\s+)?"
    r"|(?:que|que)\s+(?:hay|queda|quedan)\s+(?:de\s+|del\s+|en\s+)?"
    r"|(?:dime|muestrame|muestra|consulta|consultar|busca|buscar|lista|listar|ver)\s+"
    r"(?:el\s+|la\s+|los\s+|las\s+|cuanto\s+|cuanta\s+|cuantos\s+|cuantas\s+)?"
    r"(?:stock|inventario|disponibilidad|existencias)?\s*(?:de\s+|del\s+)?"
    r"|(?:stock|inventario|disponibilidad|existencias)\s+(?:de\s+|del\s+)?"
    r"|(?:hay|existe|existen)\s+"
    r")\s*(.+)$",
    re.IGNORECASE,
)

_RE_PRODUCTOS = re.compile(
    r"^\s*(?:"
    r"(?:cuanto|cuanta|cuantos|cuantas|que|cuales)\s+productos?\b"
    r"|(?:lista|listar|muestra|muestrame|dime|consulta|consultar|ver)\s+"
    r"(?:el\s+|la\s+|los\s+|las\s+)?"
    r"(?:inventario|productos?)\b"
    r"|(?:inventario|stock)\s+(?:general|completo|total)?\s*$"
    r")",
    re.IGNORECASE,
)

_RE_MARCA = re.compile(
    r"(?:,|;)?\s*(?:de\s+)?(?:la\s+)?marca\s+(.+?)"
    r"(?=\s*(?:,|;|$|\bcon\b|\bde\b|\bdel\b|\bque\b|\ben\b|\by\b|"
    r"\bunidades?\b|\bdisponibles?\b|\d))",
    re.IGNORECASE,
)


def _limpiar_producto(texto):
    texto = re.sub(
        r"\b(?:por favor|gracias|disponibles?|en\s+(?:el\s+)?inventario|"
        r"actualmente|ahora|unidades?|hay)\b",
        " ",
        texto,
        flags=re.IGNORECASE,
    )
    texto = re.sub(r"\s+", " ", texto).strip(" .,;:¿?¡!")
    texto = re.sub(r"^(?:el|la|los|las|un|una|unos|unas)\s+", "", texto, flags=re.IGNORECASE)
    return texto.strip(" .,;:¿?¡!")


def _extraer_consulta_simple(mensaje, permitir_multipalabra=False):
    """Devuelve (producto, marca) para consultas simples, o None."""
    texto = str(mensaje or "").strip()

    # Consulta general del inventario ("cuantos productos hay").
    if _RE_PRODUCTOS.match(texto):
        return ("", None)

    coincidencia = _RE_CONSULTA.match(texto)
    if not coincidencia:
        return None

    resto = coincidencia.group(1).strip()
    if not resto:
        return None

    marca = None
    coincidencia_marca = _RE_MARCA.search(resto)
    if coincidencia_marca:
        marca = _limpiar_producto(coincidencia_marca.group(1))
        resto = (resto[:coincidencia_marca.start()] + " " + resto[coincidencia_marca.end():]).strip()

    producto = _limpiar_producto(resto)
    if not producto:
        return None

    # Sin marca explícita solo se aceptan nombres de una palabra: así
    # "cuanto queda de leche kaly" sigue pasando por el modelo, que entiende
    # que "kaly" es la marca.
    if not marca and not permitir_multipalabra and len(producto.split()) > 1:
        return None

    return (producto, marca)


def _contrato_consulta(producto, marca, hoy):
    return {
        "action": "query",
        "target": {
            "product_name": producto or None,
            "brand": marca or None,
            "category": None,
            "type_variety": None,
            "content_value": None,
            "content_unit": None,
            "sku_code": None,
        },
        "batch": {
            "quantity": 0,
            "arrival_date": hoy,
            "expiration_date": "Por definir",
            "batch_id": None,
        },
        "changes": {"field": None, "value": None, "extra": {}},
        "option": None,
    }


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

    intencion = detectar_intencion(mensaje)

    # Consultas simples: respuesta local, sin gastar cuota ni esperar al modelo.
    if intencion == "query":
        consulta = _extraer_consulta_simple(mensaje)
        if consulta is not None:
            producto, marca = consulta
            return _contrato_consulta(producto, marca, hoy)

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

        # La intención detectada por reglas manda sobre la del modelo.
        # Esto evita que una consulta termine como add/edit/delete.
        if intencion:
            contrato["action"] = intencion

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
        # Si era una consulta clara, responder localmente en vez de fallar
        # (cuota agotada, modelo lento, sin conexión, etc.).
        if intencion == "query":
            consulta = _extraer_consulta_simple(mensaje, permitir_multipalabra=True)
            if consulta is not None:
                producto, marca = consulta
                print("Consulta respondida localmente (sin IA).")
                return _contrato_consulta(producto, marca, hoy)
        # Propagamos el error para que la API pueda devolver un mensaje claro
        # (clave inválida, modelo no disponible, sin conexión, etc.)
        raise ErrorIA(str(e)) from e
