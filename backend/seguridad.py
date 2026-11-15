"""Captcha de suma/resta y límite de intentos de inicio de sesión.

Todo se valida en el servidor: el navegador solo recibe la pregunta y un
identificador. La respuesta correcta nunca se envía al cliente.
"""
import secrets
import threading
import time

# El captcha vence a los 5 minutos y solo se puede usar una vez.
_TTL_CAPTCHA = 300
_captchas = {}
_captchas_lock = threading.Lock()

# Límite de intentos fallidos de login por IP.
_MAX_FALLOS = 10
_VENTANA_FALLOS = 600  # 10 minutos
_fallos = {}
_fallos_lock = threading.Lock()


def _limpiar_captchas(ahora):
    for clave, (_, expira) in list(_captchas.items()):
        if expira < ahora:
            _captchas.pop(clave, None)


def crear_captcha():
    """Devuelve una operación nueva y su identificador."""
    a = secrets.randbelow(9) + 1
    b = secrets.randbelow(9) + 1

    if secrets.randbelow(2) == 0:
        pregunta = f"{a} + {b}"
        respuesta = a + b
    else:
        if a < b:
            a, b = b, a
        pregunta = f"{a} - {b}"
        respuesta = a - b

    identificador = secrets.token_urlsafe(18)
    ahora = time.time()

    with _captchas_lock:
        _limpiar_captchas(ahora)
        _captchas[identificador] = (respuesta, ahora + _TTL_CAPTCHA)

    return {
        "id": identificador,
        "pregunta": pregunta,
        "expira_en_segundos": _TTL_CAPTCHA,
    }


def validar_captcha(identificador, respuesta):
    """Consume el captcha y comprueba la respuesta."""
    if not identificador or respuesta is None:
        return False

    ahora = time.time()

    with _captchas_lock:
        _limpiar_captchas(ahora)
        # pop: cada captcha sirve una sola vez, aunque la respuesta sea mala.
        datos = _captchas.pop(str(identificador), None)

    if not datos:
        return False

    valor, expira = datos
    if expira < ahora:
        return False

    try:
        return int(str(respuesta).strip()) == valor
    except (TypeError, ValueError):
        return False


def _limpiar_fallos(ip, ahora):
    intentos = _fallos.get(ip)
    if not intentos:
        return []
    intentos = [t for t in intentos if ahora - t < _VENTANA_FALLOS]
    if intentos:
        _fallos[ip] = intentos
    else:
        _fallos.pop(ip, None)
    return intentos


def permitir_intento_login(ip):
    """False si esa IP acumuló demasiados fallos recientes."""
    ahora = time.time()
    with _fallos_lock:
        return len(_limpiar_fallos(ip, ahora)) < _MAX_FALLOS


def registrar_fallo_login(ip):
    ahora = time.time()
    with _fallos_lock:
        intentos = _limpiar_fallos(ip, ahora)
        intentos.append(ahora)
        _fallos[ip] = intentos


def limpiar_fallos_login(ip):
    with _fallos_lock:
        _fallos.pop(ip, None)
