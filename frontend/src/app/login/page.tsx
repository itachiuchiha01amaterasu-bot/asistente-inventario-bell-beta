"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowPathIcon,
  EyeIcon,
  EyeSlashIcon,
} from "@heroicons/react/24/outline";
import { useAuth } from "@/context/AuthContext";
import { API_URL } from "@/lib/api";

type Captcha = { id: string; pregunta: string };

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [captcha, setCaptcha] = useState<Captcha | null>(null);
  const [respuesta, setRespuesta] = useState("");
  const [error, setError] = useState("");
  const [cargandoCaptcha, setCargandoCaptcha] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const { login, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isAuthenticated) {
      router.push("/");
    }
  }, [isAuthenticated, router]);

  const cargarCaptcha = useCallback(async () => {
    setCargandoCaptcha(true);
    setRespuesta("");
    try {
      const res = await fetch(`${API_URL}/api/auth/captcha`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (res.ok) {
        setCaptcha({ id: data.id, pregunta: data.pregunta });
      } else {
        setCaptcha(null);
        setError("No se pudo cargar la verificación de seguridad");
      }
    } catch {
      setCaptcha(null);
      setError("No se pudo conectar con el servidor");
    } finally {
      setCargandoCaptcha(false);
    }
  }, []);

  useEffect(() => {
    cargarCaptcha();
  }, [cargarCaptcha]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!captcha) {
      setError("Espera a que cargue la verificación de seguridad");
      return;
    }

    if (!respuesta.trim()) {
      setError("Escribe el resultado de la suma o resta");
      return;
    }

    setEnviando(true);

    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          captcha_id: captcha.id,
          captcha_respuesta: respuesta,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || "Error al iniciar sesión");
        // El captcha se consume en el servidor: siempre pedir uno nuevo.
        await cargarCaptcha();
        return;
      }

      login(data.access_token, data.usuario);
      router.push("/");
    } catch {
      setError("Error de conexión con el servidor");
      await cargarCaptcha();
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100dvh-8rem)] w-full items-center justify-center py-4 sm:py-8">
      <div className="w-full max-w-md rounded-lg bg-gray-800 p-5 shadow-xl sm:p-8">
        <h1 className="mb-6 text-center text-xl font-bold text-orange-500 sm:text-2xl">
          Iniciar Sesión
        </h1>

        {error && (
          <div className="mb-4 rounded bg-red-500/20 p-3 text-sm text-red-400">
            {error}
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
            <label
              htmlFor="password-login"
              className="mb-1 block text-sm font-medium text-gray-300"
            >
              Contraseña
            </label>

            <div className="relative">
              <input
                id="password-login"
                type={mostrarPassword ? "text" : "password"}
                required
                autoComplete="current-password"
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
          </div>

          <div>
            <label
              htmlFor="captcha-respuesta"
              className="mb-1 block text-sm font-medium text-gray-300"
            >
              Verificación de seguridad
            </label>

            <div className="flex items-center gap-2">
              <span className="flex min-w-0 flex-1 items-center justify-center rounded border border-gray-600 bg-gray-900 px-3 py-2.5 text-base font-semibold tracking-wide text-orange-300">
                {cargandoCaptcha
                  ? "Cargando..."
                  : captcha
                    ? `¿Cuánto es ${captcha.pregunta}?`
                    : "No disponible"}
              </span>

              <button
                type="button"
                onClick={cargarCaptcha}
                disabled={cargandoCaptcha}
                aria-label="Cambiar verificación"
                title="Cambiar verificación"
                className="shrink-0 rounded border border-gray-600 bg-gray-700 p-2.5 text-orange-400 transition hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ArrowPathIcon
                  className={`h-5 w-5 ${cargandoCaptcha ? "animate-spin" : ""}`}
                />
              </button>
            </div>

            <input
              id="captcha-respuesta"
              type="text"
              required
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              aria-describedby="captcha-ayuda"
              placeholder="Escribe el resultado"
              className="mt-2 w-full rounded border border-gray-600 bg-gray-700 px-3 py-2.5 text-base text-white focus:border-orange-500 focus:outline-none"
              value={respuesta}
              onChange={(e) => setRespuesta(e.target.value)}
            />

            <p id="captcha-ayuda" className="mt-1 text-xs text-gray-400">
              Resuelve la suma o resta para poder entrar.
            </p>
          </div>

          <button
            type="submit"
            disabled={enviando || !captcha}
            className="w-full rounded bg-orange-500 py-3 text-base font-bold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {enviando ? "Entrando..." : "Iniciar Sesión"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-400">
          ¿No tienes cuenta?{" "}
          <a href="/register" className="text-orange-400 hover:underline">
            Crear cuenta
          </a>
        </p>

        <p className="mt-2 text-center text-sm text-gray-400">
          ¿Olvidaste tu contraseña?{" "}
          <a href="/recuperar" className="text-orange-400 hover:underline">
            Recuperar contraseña
          </a>
        </p>
      </div>
    </div>
  );
}
