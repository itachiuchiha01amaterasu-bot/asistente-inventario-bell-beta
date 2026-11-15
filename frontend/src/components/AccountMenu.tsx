"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRightOnRectangleIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";
import { useAuth } from "@/context/AuthContext";

const ETIQUETA_ROL: Record<string, string> = {
  admin: "Administrador",
  super_admin: "Super administrador",
  user: "Solo consulta",
};

// Separa el usuario en palabras: "jose.fernandez" -> ["jose", "fernandez"].
const separarNombre = (nombre: string) =>
  nombre
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean);

// "Jose Fernandez" -> "JF"; "adminprueba" -> "AD".
const obtenerIniciales = (nombre: string) => {
  const partes = separarNombre(nombre);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
};

// Muestra el nombre más legible sin cambiar el usuario real.
const nombreLegible = (nombre: string) => {
  if (!/[\s._-]/.test(nombre)) return nombre;
  return separarNombre(nombre)
    .map((parte) => parte.charAt(0).toUpperCase() + parte.slice(1))
    .join(" ");
};

export default function AccountMenu() {
  const [abierto, setAbierto] = useState(false);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const { user, logout } = useAuth();
  const router = useRouter();

  // Cerrar al hacer clic fuera del menú.
  useEffect(() => {
    if (!abierto) return;
    const alHacerClic = (e: MouseEvent) => {
      if (!contenedorRef.current?.contains(e.target as Node)) {
        setAbierto(false);
      }
    };
    document.addEventListener("mousedown", alHacerClic);
    return () => document.removeEventListener("mousedown", alHacerClic);
  }, [abierto]);

  // Cerrar con la tecla Escape.
  useEffect(() => {
    if (!abierto) return;
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [abierto]);

  if (!user) return null;

  const nombre = nombreLegible(user.username);
  const iniciales = obtenerIniciales(user.username);
  const rol = ETIQUETA_ROL[user.role] ?? user.role;

  const cerrarSesion = () => {
    setAbierto(false);
    logout();
    router.push("/login");
  };

  return (
    <div ref={contenedorRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setAbierto((previo) => !previo)}
        aria-label={`Cuenta de ${nombre}`}
        aria-expanded={abierto}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-full border border-[#2a2a2a] bg-gradient-to-br from-[#1b1b1b] to-[#141414] p-1 shadow-md transition hover:border-orange-500/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 sm:pr-2.5"
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-orange-400 to-orange-600 text-[11px] font-bold text-black sm:h-9 sm:w-9 sm:text-xs">
          {iniciales}
        </span>
        <span className="hidden max-w-[130px] truncate text-sm font-semibold text-gray-200 sm:block">
          {nombre}
        </span>
        <ChevronDownIcon
          className={`hidden h-4 w-4 shrink-0 text-gray-400 transition-transform sm:block ${
            abierto ? "rotate-180" : ""
          }`}
        />
      </button>

      {abierto && (
        <div
          role="menu"
          className="absolute right-0 top-full z-[60] mt-2 w-64 overflow-hidden rounded-xl border border-[#2a2a2a] bg-[#1b1b1b] shadow-2xl"
        >
          <div className="flex items-center gap-3 border-b border-[#2a2a2a] p-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-orange-400 to-orange-600 text-sm font-bold text-black">
              {iniciales}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-100">
                {nombre}
              </p>
              {user.email && (
                <p className="truncate text-xs text-gray-400">{user.email}</p>
              )}
              <p className="mt-1 inline-block rounded-full bg-orange-500/15 px-2 py-0.5 text-[11px] font-medium text-orange-300">
                {rol}
              </p>
            </div>
          </div>

          <button
            type="button"
            role="menuitem"
            onClick={cerrarSesion}
            className="flex w-full items-center gap-2 px-4 py-3 text-sm font-semibold text-red-400 transition hover:bg-red-500/15"
          >
            <ArrowRightOnRectangleIcon className="h-5 w-5" />
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}
