import json
import os
import re
import time
import unicodedata
from datetime import date, datetime

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
        "suma", "sumar", "sumale", "súmale", "incrementa", "incrementar",
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

# Fechas: 20/12/2026, 20-12-2026, 20/12/26 y 2026-12-20.
_RE_FECHA = re.compile(
    r"\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b"
    r"|\b(\d{4})-(\d{1,2})-(\d{1,2})\b"
)

# "fecha de vencimiento" / "fecha de caducidad" es una edición, aunque
# el mensaje empiece con "agrega" o "ponle".
_RE_FECHA_VENCIMIENTO = re.compile(
    r"\b(vencimiento|caducidad|caduca|caducan|vence|vencen)\b"
)


def extraer_fecha(texto, cerca_de=None):
    """Devuelve una fecha válida del texto, o None.

    Si se indica ``cerca_de`` (posición del texto), se prefiere la primera
    fecha que aparezca a partir de ahí. Así, en "ingresó el 10/01/2026 y
    vence el 20/12/2026", el vencimiento es la segunda fecha.
    """
    encontradas = []

    for coincidencia in _RE_FECHA.finditer(str(texto or "")):
        if coincidencia.group(1):
            dia, mes, anio = (
                int(coincidencia.group(1)),
                int(coincidencia.group(2)),
                int(coincidencia.group(3)),
            )
            if anio < 100:
                anio += 2000
        else:
            anio, mes, dia = (
                int(coincidencia.group(4)),
                int(coincidencia.group(5)),
                int(coincidencia.group(6)),
            )

        try:
            fecha = date(anio, mes, dia)
        except ValueError:
            continue

        encontradas.append((coincidencia, fecha))

    if not encontradas:
        return None

    if cerca_de is None:
        return encontradas[0][1]

    posteriores = [f for f in encontradas if f[0].start() >= cerca_de]
    if posteriores:
        return posteriores[0][1]

    return encontradas[-1][1]


def _aplicar_fecha_vencimiento(contrato, mensaje, texto, lote_id):
    """Fuerza la fecha de vencimiento cuando el mensaje la menciona.

    No depende del modelo: si el texto dice "vence el 20/12/2026", ese dato
    manda sobre lo que haya devuelto la IA, tanto al agregar como al editar.
    """
    accion = contrato.get("action")
    if accion not in ("edit", "add"):
        return contrato

    mencion = _RE_FECHA_VENCIMIENTO.search(texto)
    if not mencion:
        return contrato

    # Si el mensaje trae dos fechas (ingreso y vencimiento), la que está
    # después de "vence"/"caduca" es la de vencimiento.
    fecha = extraer_fecha(mensaje, cerca_de=mencion.end())
    if not fecha:
        return contrato

    if accion == "add":
        contrato.setdefault("batch", {})["expiration_date"] = fecha.isoformat()
        return contrato

    contrato.setdefault("changes", {})
    contrato["changes"]["field"] = "expiration_date"
    contrato["changes"]["value"] = fecha.isoformat()

    contrato.setdefault("batch", {})
    contrato["batch"]["expiration_date"] = fecha.isoformat()
    if lote_id:
        contrato["batch"]["batch_id"] = lote_id

    return contrato


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
            # "agrega/ponle la fecha de vencimiento..." es una edición,
            # no un producto nuevo.
            if (
                accion == "add"
                and "fecha" in texto
                and _RE_FECHA_VENCIMIENTO.search(texto)
            ):
                return "edit"

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

REGLAS DE ALTA (action "add"):
- Completa target.product_name, brand (marca), category (rubro),
  type_variety (variedad), content_value y content_unit.
- En product_name escribe SOLO el nombre del producto, sin repetir la marca,
  el rubro, la variedad ni el contenido.
- batch.quantity = unidades que ingresan.
- batch.arrival_date = fecha de ingreso.
- batch.expiration_date = fecha de vencimiento.

REGLAS DE EDICIÓN (action "edit"):
- changes.field debe ser EXACTAMENTE uno de estos valores:
  "brand" (marca), "category" (rubro), "product_name" (nombre),
  "type_variety" (variedad), "content" (contenido),
  "batch_quantity" (cantidad de un lote) o "expiration_date" (vencimiento).
- changes.value lleva el valor nuevo exacto. Para content usa "1.5 L" o "500 g".
  Para fechas usa el formato AAAA-MM-DD.
- Si el mensaje menciona un lote ("lote 3"), copia ese número en batch.batch_id.
- Para sumar unidades ("suma 5", "agrega 5 más"), usa action "edit",
  changes.field "batch_quantity" y changes.value con la cantidad a sumar.

REGLAS DE CONSULTA (action "query"):
- target.product_name y target.brand identifican el producto; deja en null
  los campos que el usuario no mencione.

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

        texto_norm = _normalizar_texto(mensaje)

        # "agrega más leche" / "suma 5 unidades" suma al lote existente en
        # vez de reemplazar la cantidad.
        if contrato["action"] == "edit" and (
            re.search(r"\bmas\b", texto_norm)
            or texto_norm.startswith(("suma ", "sumale ", "incrementa "))
        ):
            contrato.setdefault("changes", {}).setdefault("extra", {})["sumar"] = True

        if lote_id_detectado:
            contrato["batch"]["batch_id"] = lote_id_detectado
            # Solo forzar cantidad si el mensaje habla de cantidad/stock.
            # Antes cualquier "lote 3" cambiaba el campo a cantidad y rompía
            # la edición de la fecha de vencimiento.
            if contrato["action"] == "edit" and re.search(
                r"\b(cantidad|unidades|stock|existencias)\b", texto
            ):
                contrato["changes"]["field"] = "batch_quantity"

        # Las fechas dichas por el usuario mandan sobre la interpretación
        # del modelo (y no gastan una llamada extra).
        contrato = _aplicar_fecha_vencimiento(
            contrato, mensaje, texto, lote_id_detectado
        )

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
            pn = str(pn).strip().lower()

            # El modelo a veces incluye etiquetas dentro del nombre.
            pn = re.sub(
                r"\b(?:del\s+rubro|rubro|categor[ií]a|marca|variedad|tipo|contenido)\b",
                " ",
                pn,
            )

            # Y a veces repite la marca, el rubro o la variedad en el nombre.
            for campo in ("brand", "category", "type_variety"):
                valor = str(contrato["target"].get(campo) or "").strip().lower()
                if valor:
                    pn = re.sub(rf"\b{re.escape(valor)}\b", " ", pn)

            # Quitar el contenido ("1 litro", "500 g") si vino en el nombre.
            contenido_valor = contrato["target"].get("content_value")
            contenido_unidad = str(
                contrato["target"].get("content_unit") or ""
            ).lower()

            # "1.0" y "1" son el mismo contenido: se comparan igual.
            if contenido_valor is not None:
                try:
                    numero_contenido = float(contenido_valor)
                    if numero_contenido == int(numero_contenido):
                        contenido_valor = int(numero_contenido)
                except (TypeError, ValueError):
                    pass

            if contenido_valor is not None and contenido_unidad:
                unidades = {
                    "l": r"(?:l|lt|litro|litros)",
                    "ml": r"(?:ml|mililitro|mililitros)",
                    "kg": r"(?:kg|kilo|kilos|kilogramo|kilogramos)",
                    "g": r"(?:g|gr|gramo|gramos)",
                }.get(contenido_unidad)
                if unidades:
                    pn = re.sub(
                        rf"\b{re.escape(str(contenido_valor))}\s*{unidades}\b",
                        " ",
                        pn,
                    )

            pn = re.sub(r"\s+", " ", pn).strip(" .,;:¿?¡!")
            pn = re.sub(r"^(?:el|la|los|las|un|una|unos|unas)\s+", "", pn)
            pn = re.sub(r"\s+(?:de|del|la|el|los|las)\s*$", "", pn)
            pn = pn.strip(" .,;:¿?¡!")

            if pn:
                contrato["target"]["product_name"] = pn[0].upper() + pn[1:]

        if contrato["action"] == "delete":
            # "elimina el lote 6" no significa borrar 6 unidades: se quita
            # la referencia al lote antes de buscar una cantidad.
            sin_lote = re.sub(
                r"\blote\s*#?\s*\d+\b", " ", mensaje, flags=re.IGNORECASE
            )
            match_qty = re.search(r"(\d+)", sin_lote)
            contrato["batch"]["quantity"] = (
                int(match_qty.group(1)) if match_qty else 0
            )

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
