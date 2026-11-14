"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import DateDisplay from "./DateDisplay";
import { CalendarIcon, Bars3Icon } from "@heroicons/react/24/outline";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const pathname = usePathname();

  // Cerrar el menú al cambiar de página.
  useEffect(() => {
    setMenuAbierto(false);
  }, [pathname]);

  // Evitar que el fondo se desplace mientras el menú móvil está abierto.
  useEffect(() => {
    if (!menuAbierto) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = anterior;
    };
  }, [menuAbierto]);

  // Cerrar el menú con la tecla Escape.
  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuAbierto(false);
    };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, []);

  return (
    <div className="app-shell flex overflow-hidden bg-[#0f0f0f]">
      {/* Fondo oscuro del menú */}
      {menuAbierto && (
        <button
          type="button"
          aria-label="Cerrar menú"
          onClick={() => setMenuAbierto(false)}
          className="fixed inset-0 z-40 bg-black/60"
        />
      )}

      {/* Menú deslizable (móvil, tablet y escritorio) */}
      <div
        className={`fixed inset-y-0 left-0 z-50 transform shadow-2xl transition-transform duration-300 ease-out ${
          menuAbierto ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-hidden={!menuAbierto}
        inert={!menuAbierto}
      >
        <Sidebar
          onNavigate={() => setMenuAbierto(false)}
          onClose={() => setMenuAbierto(false)}
        />
      </div>

      {/* Contenido */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-[#2a2a2a] bg-[#141414] px-3 shadow-md sm:h-16 sm:px-5 lg:px-8">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setMenuAbierto(true)}
              aria-label="Abrir menú"
              aria-expanded={menuAbierto}
              className="shrink-0 rounded-lg border border-[#2a2a2a] p-2 text-orange-400 transition hover:bg-[#1f1f1f]"
            >
              <Bars3Icon className="h-6 w-6" />
            </button>

            <h2 className="truncate text-[15px] font-semibold text-orange-400 sm:text-xl lg:text-2xl">
              Gestión de Inventario
            </h2>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 rounded-lg border border-[#2a2a2a] bg-gradient-to-br from-[#1b1b1b] to-[#141414] px-2 py-1.5 shadow-md sm:gap-2 sm:rounded-xl sm:px-4 sm:py-2">
            <CalendarIcon className="h-4 w-4 text-orange-500 sm:h-5 sm:w-5 lg:h-6 lg:w-6" />
            <DateDisplay />
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-y-auto bg-[#0f0f0f] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6 lg:p-10">
          {children}
        </main>
      </div>
    </div>
  );
}
