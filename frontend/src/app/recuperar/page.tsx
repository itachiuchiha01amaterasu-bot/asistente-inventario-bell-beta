"use client";

import { useState } from "react";
import Link from "next/link";
import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline";
import { API_URL } from "@/lib/api";

export default function RecuperarPage() {
  const [paso, setPaso] = useState<1 | 2 | 3>(1);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [mostrarConfirmar, setMostrarConfirmar] = useState(false);
  const [resetToken, setResetToken] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  const verificarDatos = async (e: React.FormEvent) => {
    e.preventDefault();
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
        setError(data.error || "No se pudieron verificar los datos");
        return;
      }

      setResetToken(data.reset_token);
      setPaso(2);
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
      setPaso(3);
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

        <p className="mb-6 text-center text-sm text-gray-400">
          {paso === 1 && "Verifica tu usuario y tu correo para continuar."}
          {paso === 2 && "Escribe la contraseña nueva que quieres usar."}
          {paso === 3 && "Tu contraseña se cambió correctamente."}
        </p>

        {error && (
          <div className="mb-4 rounded bg-red-500/20 p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {paso === 1 && (
          <form onSubmit={verificarDatos} className="space-y-4">
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
            </div>

            <button
              type="submit"
              disabled={cargando}
              className="w-full rounded bg-orange-500 py-3 text-base font-bold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {cargando ? "Verificando..." : "Continuar"}
            </button>
          </form>
        )}

        {paso === 2 && (
          <form onSubmit={cambiarPassword} className="space-y-4">
            <div>
              <label
                htmlFor="password-nueva"
                className="mb-1 block text-sm font-medium text-gray-300"
              >
                Contraseña nueva
              </label>

              <div className="relative">
                <input
                  id="password-nueva"
                  type={mostrarPassword ? "text" : "password"}
                  required
                  autoComplete="new-password"
                  aria-describedby="password-nueva-ayuda"
                  className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2.5 pr-12 text-base text-white focus:border-orange-500 focus:outline-none"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />

                <button
                  type="button"
                  onClick={() => setMostrarPassword((previo) => !previo)}
                  aria-label={
                    mostrarPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                  }
                  title={
                    mostrarPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                  }
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-gray-400 transition hover:bg-gray-600 hover:text-white"
                >
                  {mostrarPassword ? (
                    <EyeSlashIcon className="h-5 w-5" />
                  ) : (
                    <EyeIcon className="h-5 w-5" />
                  )}
                </button>
              </div>

              <p
                id="password-nueva-ayuda"
                className="mt-1 text-xs text-gray-400"
              >
                Mínimo 8 caracteres.
              </p>
            </div>

            <div>
              <label
                htmlFor="password-confirmar"
                className="mb-1 block text-sm font-medium text-gray-300"
              >
                Confirmar contraseña
              </label>

              <div className="relative">
                <input
                  id="password-confirmar"
                  type={mostrarConfirmar ? "text" : "password"}
                  required
                  autoComplete="new-password"
                  className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2.5 pr-12 text-base text-white focus:border-orange-500 focus:outline-none"
                  value={confirmar}
                  onChange={(e) => setConfirmar(e.target.value)}
                />

                <button
                  type="button"
                  onClick={() => setMostrarConfirmar((previo) => !previo)}
                  aria-label={
                    mostrarConfirmar
                      ? "Ocultar confirmación"
                      : "Mostrar confirmación"
                  }
                  title={
                    mostrarConfirmar
                      ? "Ocultar confirmación"
                      : "Mostrar confirmación"
                  }
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-gray-400 transition hover:bg-gray-600 hover:text-white"
                >
                  {mostrarConfirmar ? (
                    <EyeSlashIcon className="h-5 w-5" />
                  ) : (
                    <EyeIcon className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={cargando}
              className="w-full rounded bg-orange-500 py-3 text-base font-bold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {cargando ? "Guardando..." : "Cambiar contraseña"}
            </button>
          </form>
        )}

        {paso === 3 && (
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

        {paso !== 3 && (
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
