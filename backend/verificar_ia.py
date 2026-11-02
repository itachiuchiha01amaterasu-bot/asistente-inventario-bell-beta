"""Verifica la conexión con el proveedor de IA y prueba el modelo principal y los de respaldo.

Uso (desde la raíz del proyecto):
    source backend/venv/bin/activate
    python -m backend.verificar_ia
"""
import os
import sys

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

from openai import OpenAI  # noqa: E402


def probar(client, modelo):
    try:
        resp = client.chat.completions.create(
            model=modelo,
            messages=[
                {"role": "user", "content": 'Responde únicamente con este JSON: {"ok": true}'}
            ],
            temperature=0,
            max_tokens=50,
            timeout=60,
        )
        contenido = (resp.choices[0].message.content or "").strip()
        return True, contenido
    except Exception as e:
        return False, str(e)


def main():
    base_url = os.environ.get("IA_BASE_URL", "https://openrouter.ai/api/v1")
    modelo = os.environ.get("IA_MODEL", "nvidia/nemotron-3.5-lightning:free")
    respaldos = [
        m.strip()
        for m in os.environ.get("IA_FALLBACK_MODELS", "").split(",")
        if m.strip()
    ]
    api_key = os.environ.get("IA_API_KEY") or os.environ.get("GROQ_API_KEY")

    print(f"Proveedor: {base_url}")
    if not api_key:
        print("✗ No hay IA_API_KEY en backend/.env")
        return 1
    print(f"Clave:     {api_key[:8]}...{api_key[-4:]} ({len(api_key)} caracteres)\n")

    client = OpenAI(api_key=api_key, base_url=base_url, timeout=60, max_retries=0)

    modelos = [modelo] + [m for m in respaldos if m != modelo]
    alguno_ok = False
    for m in modelos:
        ok, detalle = probar(client, m)
        rol = "principal" if m == modelo else "respaldo"
        if ok:
            alguno_ok = True
            print(f"✓ [{rol}] {m}\n    Respuesta: {detalle[:120]}")
        else:
            print(f"✗ [{rol}] {m}\n    {detalle[:160]}")

    if alguno_ok:
        print("\n✓ Hay al menos un modelo funcionando. El asistente usará el primero disponible.")
        return 0

    print("\n✗ Ningún modelo respondió. Revisa la clave o prueba otros modelos gratuitos.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
