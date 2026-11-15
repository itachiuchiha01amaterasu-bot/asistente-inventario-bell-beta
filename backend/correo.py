"""Envío del código de recuperación por correo.

Proveedores soportados (se eligen con variables de entorno):

- Resend:  CORREO_MODO=resend + RESEND_API_KEY (+ CORREO_REMITENTE)
- SMTP:    CORREO_MODO=smtp + SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD
- Consola: CORREO_MODO=consola (solo para pruebas locales; imprime el código
  en el log del servidor)

Si no se define CORREO_MODO, se detecta automáticamente Resend o SMTP.
"""
import json
import os
import smtplib
import ssl
from email.message import EmailMessage
from urllib import request as urlrequest
from urllib.error import HTTPError, URLError

ASUNTO = "Tu código de recuperación - Bell IA"


class ErrorCorreo(Exception):
    """Falla al preparar o enviar el correo."""


def _texto(codigo, usuario):
    return (
        f"Hola {usuario},\n\n"
        f"Tu código de recuperación es: {codigo}\n\n"
        "Vence en 10 minutos y solo se puede usar una vez.\n"
        "Si no solicitaste este cambio, ignora este mensaje.\n\n"
        "Bell IA"
    )


def _html(codigo, usuario):
    plantilla = """<!DOCTYPE html>
<html lang="es">
  <body style="margin:0;padding:0;background:#0f0f0f;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f0f;padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#1b1b1b;border:1px solid #2a2a2a;border-radius:14px;padding:32px;">
            <tr>
              <td style="text-align:center;padding-bottom:8px;">
                <span style="font-size:20px;font-weight:bold;color:#ffa64d;">Bell IA</span>
              </td>
            </tr>
            <tr>
              <td style="text-align:center;padding-bottom:8px;">
                <h1 style="margin:0;font-size:20px;color:#f5f5f5;">Recuperar contraseña</h1>
              </td>
            </tr>
            <tr>
              <td style="text-align:center;color:#a3a3a3;font-size:14px;line-height:22px;padding-bottom:20px;">
                Hola __USUARIO__, este es tu código de verificación:
              </td>
            </tr>
            <tr>
              <td style="text-align:center;padding:18px 0;">
                <span style="display:inline-block;background:#ffa64d;color:#111111;font-size:32px;font-weight:bold;letter-spacing:10px;padding:14px 22px;border-radius:10px;">__CODIGO__</span>
              </td>
            </tr>
            <tr>
              <td style="text-align:center;color:#a3a3a3;font-size:13px;line-height:20px;">
                Vence en <strong style="color:#f5f5f5;">10 minutos</strong> y solo se puede usar una vez.
              </td>
            </tr>
            <tr>
              <td style="text-align:center;color:#737373;font-size:12px;line-height:18px;padding-top:20px;">
                Si no solicitaste este cambio, ignora este mensaje.<br />Tu contraseña no cambiará.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>"""
    return plantilla.replace("__USUARIO__", usuario).replace("__CODIGO__", codigo)


def _enviar_resend(destinatario, usuario, codigo):
    clave = os.environ.get("RESEND_API_KEY")
    if not clave:
        raise ErrorCorreo("Falta RESEND_API_KEY")

    remitente = (
        os.environ.get("CORREO_REMITENTE")
        or "Bell IA <onboarding@resend.dev>"
    )

    carga = json.dumps({
        "from": remitente,
        "to": [destinatario],
        "subject": ASUNTO,
        "text": _texto(codigo, usuario),
        "html": _html(codigo, usuario),
    }).encode("utf-8")

    solicitud = urlrequest.Request(
        "https://api.resend.com/emails",
        data=carga,
        method="POST",
        headers={
            "Authorization": f"Bearer {clave}",
            "Content-Type": "application/json",
            "User-Agent": "BellIA/1.0",
        },
    )

    try:
        with urlrequest.urlopen(solicitud, timeout=20) as respuesta:
            if respuesta.status >= 300:
                raise ErrorCorreo(f"Resend respondió {respuesta.status}")
    except HTTPError as e:
        detalle = e.read().decode("utf-8", "replace")[:300]
        raise ErrorCorreo(f"Resend rechazó el envío ({e.code}): {detalle}")
    except URLError as e:
        raise ErrorCorreo(f"No se pudo conectar con Resend: {e.reason}")


def _enviar_smtp(destinatario, usuario, codigo):
    host = os.environ.get("SMTP_HOST")
    if not host:
        raise ErrorCorreo("Falta SMTP_HOST")

    puerto = int(os.environ.get("SMTP_PORT", "587"))
    usuario_smtp = os.environ.get("SMTP_USER")
    clave_smtp = os.environ.get("SMTP_PASSWORD")
    remitente = (
        os.environ.get("CORREO_REMITENTE")
        or usuario_smtp
        or "no-reply@localhost"
    )

    mensaje = EmailMessage()
    mensaje["Subject"] = ASUNTO
    mensaje["From"] = remitente
    mensaje["To"] = destinatario
    mensaje.set_content(_texto(codigo, usuario))
    mensaje.add_alternative(_html(codigo, usuario), subtype="html")

    contexto = ssl.create_default_context()

    try:
        if puerto == 465:
            with smtplib.SMTP_SSL(
                host, puerto, timeout=20, context=contexto
            ) as servidor:
                if usuario_smtp:
                    servidor.login(usuario_smtp, clave_smtp)
                servidor.send_message(mensaje)
        else:
            with smtplib.SMTP(host, puerto, timeout=20) as servidor:
                servidor.ehlo()
                servidor.starttls(context=contexto)
                servidor.ehlo()
                if usuario_smtp:
                    servidor.login(usuario_smtp, clave_smtp)
                servidor.send_message(mensaje)
    except (smtplib.SMTPException, OSError) as e:
        raise ErrorCorreo(f"No se pudo enviar por SMTP: {e}")


def enviar_codigo(destinatario, codigo, usuario):
    """Envía el código y devuelve el modo usado."""
    modo = (os.environ.get("CORREO_MODO") or "").strip().lower()

    if not modo:
        if os.environ.get("RESEND_API_KEY"):
            modo = "resend"
        elif os.environ.get("SMTP_HOST"):
            modo = "smtp"

    if modo == "resend":
        _enviar_resend(destinatario, usuario, codigo)
        return "resend"

    if modo == "smtp":
        _enviar_smtp(destinatario, usuario, codigo)
        return "smtp"

    if modo == "consola":
        print(
            f"[CORREO:CONSOLA] Código de {usuario} "
            f"({destinatario}): {codigo}",
            flush=True,
        )
        return "consola"

    raise ErrorCorreo(
        "El envío de correos no está configurado. "
        "Define CORREO_MODO=resend (con RESEND_API_KEY) o CORREO_MODO=smtp."
    )
