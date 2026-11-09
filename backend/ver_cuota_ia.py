"""Muestra cuántas consultas gratuitas quedan en OpenRouter y cuándo se reinician.

Uso:
    cd ~/Proyectos/inventario_app
    source backend/venv/bin/activate
    python3 backend/ver_cuota_ia.py
"""

import json
import os
import urllib.request
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

URL_CLAVE = "https://openrouter.ai/api/v1/key"
ZONA_VENEZUELA = timezone(timedelta(hours=-4))


def obtener_cuota():
    clave = os.environ.get("IA_API_KEY")
    if not clave:
        raise SystemExit("Falta IA_API_KEY en backend/.env")

    peticion = urllib.request.Request(
        URL_CLAVE, headers={"Authorization": f"Bearer {clave}"}
    )
    with urllib.request.urlopen(peticion, timeout=30) as respuesta:
        return json.loads(respuesta.read().decode())["data"]


def proximo_reinicio_utc():
    ahora = datetime.now(timezone.utc)
    return (ahora + timedelta(days=1)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )


def main():
    datos = obtener_cuota()
    cuota = datos.get("free_model_daily_requests") or {}

    usadas = cuota.get("used")
    limite = cuota.get("limit")
    restantes = cuota.get("remaining")

    print("OpenRouter - modelo gratuito")
    print(f"  Consultas usadas hoy: {usadas}")
    print(f"  Límite diario:        {limite}")
    print(f"  Restantes:            {restantes}")

    reinicio_utc = proximo_reinicio_utc()
    reinicio_vzla = reinicio_utc.astimezone(ZONA_VENEZUELA)
    print(f"\n  Reinicio: {reinicio_utc:%Y-%m-%d %H:%M} UTC")
    print(f"            {reinicio_vzla:%Y-%m-%d %H:%M} hora de Venezuela (UTC-4)")

    if restantes == 0:
        print(
            "\n  Cuota agotada. Las consultas de stock siguen funcionando "
            "(se responden sin IA), pero agregar/editar/eliminar fallará "
            "hasta el reinicio."
        )
    elif restantes is not None:
        print(f"\n  Te quedan {restantes} consultas para hoy.")


if __name__ == "__main__":
    main()
