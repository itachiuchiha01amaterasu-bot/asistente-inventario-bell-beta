"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { API_URL } from "@/lib/api";

const LARGO_CODIGO = 6;

export default function RecuperarPage() {
  const [paso, setPaso] = useState<1 | 2 | 3 | 4>(1);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [codigo, setCodigo] = useState("");
  const [password, setPassword] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [resetToken, setResetToken] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const [segundos, setSegundos] = useState(0);

  // Cuenta atrás para poder pedir otro código.
  useEffect(() => {
    if (segundos <= 0) return;
    const temporizador = setTimeout(
      () => setSegundos((previo) => (previo > 0 ? previo - 1 : 0)),
      1000
    );
    return () => clearTimeout(temporizador);
  }, [segundos]);

  const pedirCodigo = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError("");
    setCargando(true);

    try {
      const res = await fetch(`${API_URL}/api/auth/recuperar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (typeof data.reintentar_en === "number") {
          setSegundos(data.reintentar_en);
        }
        setError(data.error || "No se pudo enviar el código");
        return;
      }

      setMensaje(data.mensaje || "Te enviamos un código a tu correo.");
      setSegundos(
        typeof data.reintentar_en === "number" ? data.reintentar_en : 60
      );
      setCodigo("");
      setPaso(2);
    } catch {
      setError("No se pudo conectar con el servidor. Intenta de nuevo.");
    } finally {
      setCargando(false);
    }
  };

  const verificarCodigo = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!new RegExp(`^\\d{${LARGO_CODIGO}}$`).test(codigo)) {
      setError(`El código debe tener ${LARGO_CODIGO} dígitos`);
      return;
    }

    setCargando(true);

    try {
      const res = await fetch(`${API_URL}/api/auth/verificar-codigo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, codigo }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || "El código no es válido");
        return;
      }

      setResetToken(data.reset_token);
      setMensaje("");
      setPaso(3);
    } catch {
      setError("No se pudo conectar con el servidor. Intenta de nuevo.");
    } finally {
      setCargando(false);
    }
  };

  const cambiarPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres");
      return;
    }

    if (password !== confirmar) {
      setError("Las contraseñas no coinciden");
      return;
    }

    setCargando(true);

    try {
      const res = await fetch(`${API_URL}/api/auth/restablecer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: resetToken, password }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || "No se pudo cambiar la contraseña");
        return;
      }

      setPassword("");
      setConfirmar("");
      setPaso(4);
    } catch {
      setError("No se pudo conectar con el servidor. Intenta de nuevo.");
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100dvh-8rem)] w-full items-center justify-center py-4 sm:py-8">
      <div className="w-full max-w-md rounded-lg bg-gray-800 p-5 shadow-xl sm:p-8">
        <h1 className="mb-2 text-center text-xl font-bold text-orange-500 sm:text-2xl">
          Recuperar contraseña
        </h1>

        <p className="mb-1 text-center text-xs font-medium uppercase tracking-wide text-orange-300">
          {paso === 4 ? "Completado" : `Paso ${paso} de 3`}
        </p>

        <p className="mb-6 text-center text-sm text-gray-400">
          {paso === 1 && "Verifica tu usuario y tu correo para recibir un código."}
          {paso === 2 && "Escribe el código de 6 dígitos que enviamos a tu correo."}
          {paso === 3 && "Escribe la contraseña nueva que quieres usar."}
          {paso === 4 && "Tu contraseña se cambió correctamente."}
        </p>

        {error && (
          <div className="mb-4 rounded bg-red-500/20 p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {mensaje && paso === 2 && (
          <div className="mb-4 rounded bg-green-500/20 p-3 text-sm text-green-400">
            {mensaje}
          </div>
        )}

        {paso === 1 && (
          <form onSubmit={pedirCodigo} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-300">
                Usuario
              </label>
              <input
                type="text"
                required
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2.5 text-base text-white focus:border-orange-500 focus:outline-none"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-300">
                Correo electrónico
              </label>
              <input
                type="email"
                required
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2.5 text-base text-white focus:border-orange-500 focus:outline-none"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <p className="mt-1 text-xs text-gray-400">
                Debe ser el correo registrado en tu cuenta.
              </p>
            </div>

            <button
              type="submit"
              disabled={cargando}
              className="w-full rounded bg-orange-500 py-3 text-base font-bold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {cargando ? "Enviando..." : "Enviar código"}
            </button>
          </form>
        )}

        {paso === 2 && (
          <form onSubmit={verificarCodigo} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-300">
                Código de confirmación
              </label>
              <input
                type="text"
                required
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={LARGO_CODIGO}
                autoComplete="one-time-code"
                placeholder="000000"
                className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-3 text-center text-2xl font-bold tracking-[0.5em] text-white focus:border-orange-500 focus:outline-none"
                value={codigo}
                onChange={(e) =>
                  setCodigo(e.target.value.replace(/\D/g, "").slice(0, LARGO_CODIGO))
                }
              />
              <p className="mt-2 text-xs text-gray-400">
                El código vence en 10 minutos.
              </p>
            </div>

            <button
              type="submit"
              disabled={cargando}
              className="w-full rounded bg-orange-500 py-3 text-base font-bold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {cargando ? "Verificando..." : "Verificar código"}
            </button>

            <div className="flex flex-col items-center gap-2 text-sm text-gray-400">
              <button
                type="button"
                onClick={() => pedirCodigo()}
                disabled={cargando || segundos > 0}
                className="text-orange-400 transition hover:underline disabled:cursor-not-allowed disabled:text-gray-500 disabled:no-underline"
              >
                {segundos > 0
                  ? `Reenviar código (${segundos} s)`
                  : "Reenviar código"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setPaso(1);
                  setMensaje("");
                  setCodigo("");
                  setError("");
                }}
                className="text-gray-400 transition hover:text-gray-200 hover:underline"
              >
                Usar otros datos
              </button>
            </div>
          </form>
        )}

        {paso === 3 && (
          <form onSubmit={cambiarPassword} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-300">
                Contraseña nueva
              </label>
              <input
                type={mostrarPassword ? "text" : "password"}
                required
                autoComplete="new-password"
                className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2.5 text-base text-white focus:border-orange-500 focus:outline-none"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p className="mt-1 text-xs text-gray-400">
                Mínimo 8 caracteres.
              </p>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-300">
                Confirmar contraseña
              </label>
              <input
                type={mostrarPassword ? "text" : "password"}
                required
                autoComplete="new-password"
                className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2.5 text-base text-white focus:border-orange-500 focus:outline-none"
                value={confirmar}
                onChange={(e) => setConfirmar(e.target.value)}
              />
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={mostrarPassword}
                onChange={(e) => setMostrarPassword(e.target.checked)}
                className="h-4 w-4 accent-orange-500"
              />
              Mostrar contraseñas
            </label>

            <button
              type="submit"
              disabled={cargando}
              className="w-full rounded bg-orange-500 py-3 text-base font-bold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {cargando ? "Guardando..." : "Cambiar contraseña"}
            </button>
          </form>
        )}

        {paso === 4 && (
          <div className="space-y-5">
            <div className="rounded bg-green-500/20 p-3 text-sm text-green-400">
              Listo. Ya puedes iniciar sesión con tu contraseña nueva.
            </div>

            <Link
              href="/login"
              className="block w-full rounded bg-orange-500 py-3 text-center text-base font-bold text-white transition hover:bg-orange-600"
            >
              Ir a iniciar sesión
            </Link>
          </div>
        )}

        {paso !== 4 && (
          <p className="mt-6 text-center text-sm text-gray-400">
            <a href="/login" className="text-orange-400 hover:underline">
              Volver a iniciar sesión
            </a>
          </p>
        )}
      </div>
    </div>
  );
}
