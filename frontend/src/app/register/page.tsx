"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline";
import { API_URL } from "@/lib/api";

export default function RegisterPage() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [enviando, setEnviando] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres");
      return;
    }

    setEnviando(true);

    try {
      const res = await fetch(`${API_URL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || "Error al registrar");
        return;
      }

      setSuccess("Cuenta creada correctamente. Te llevamos al inicio de sesión...");
      setPassword("");

      // El login exige captcha, así que no se inicia sesión automáticamente.
      setTimeout(() => router.push("/login"), 1800);
    } catch {
      setError("Error de conexión con el servidor");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100dvh-8rem)] w-full items-center justify-center py-4 sm:py-8">
      <div className="w-full max-w-md rounded-lg bg-gray-800 p-5 shadow-xl sm:p-8">
        <h1 className="mb-6 text-center text-xl font-bold text-orange-500 sm:text-2xl">
          Crear cuenta
        </h1>

        {error && (
          <div className="mb-4 rounded bg-red-500/20 p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 rounded bg-green-500/20 p-3 text-sm text-green-400">
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
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

          <div>
            <label
              htmlFor="password-registro"
              className="mb-1 block text-sm font-medium text-gray-300"
            >
              Contraseña
            </label>

            <div className="relative">
              <input
                id="password-registro"
                type={mostrarPassword ? "text" : "password"}
                required
                minLength={8}
                autoComplete="new-password"
                aria-describedby="password-ayuda"
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

            <p id="password-ayuda" className="mt-1 text-xs text-gray-400">
              Mínimo 8 caracteres.
            </p>
          </div>

          <button
            type="submit"
            disabled={enviando}
            className="w-full rounded bg-orange-500 py-3 text-base font-bold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {enviando ? "Creando cuenta..." : "Crear cuenta"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-400">
          ¿Ya tienes cuenta?{" "}
          <a href="/login" className="text-orange-400 hover:underline">
            Inicia sesión
          </a>
        </p>
      </div>
    </div>
  );
}
