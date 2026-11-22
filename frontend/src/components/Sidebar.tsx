"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";

import {
  ChartBarIcon,
  CubeIcon,
  ChatBubbleLeftRightIcon,
  DocumentChartBarIcon,
  PlusCircleIcon,
  ReceiptPercentIcon,
  ShoppingCartIcon,
  UsersIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

import { useAuth } from "@/context/AuthContext";

type Props = {
  onNavigate?: () => void;
  onClose?: () => void;
};

export default function Sidebar({ onNavigate, onClose }: Props) {
  const path = usePathname();
  const { user, isReady } = useAuth();

  // "Agregar Producto" solo existe para admin y super_admin.
  // El backend vuelve a validar el rol aunque alguien fuerce la URL.
  const esAdmin = user?.role === "admin" || user?.role === "super_admin";

  const linkClass = (route: string) =>
    `flex items-center gap-3 rounded-md px-4 py-2.5 mb-2 text-sm font-semibold transition lg:px-6 lg:py-3 lg:text-base
    ${
      path === route
        ? "!bg-orange-500 !text-black"
        : "text-naranja2 hover:bg-fondo"
    }`;

  const iconClass = (route: string) =>
    `h-5 w-5 shrink-0 transition lg:h-6 lg:w-6 ${
      path === route ? "!text-black" : "text-naranja2"
    }`;

  return (
    <aside className="flex h-full w-72 max-w-[85vw] flex-col overflow-y-auto border-r border-naranja2 bg-fondo2 p-4 shadow-2xl sm:p-6">
      {/* Logo */}
      <div className="relative mb-6 flex flex-col items-center lg:mb-10">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar menú"
            className="absolute right-0 top-0 rounded-md p-1.5 text-gray-400 transition hover:bg-[#1f1f1f] hover:text-white"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        )}

        <Image
          src="/logo-bell.png"
          alt="Logo Bell IA"
          width={160}
          height={160}
          className="h-auto w-28 object-contain sm:w-36 lg:w-40"
          loading="eager"
        />
      </div>

      {/* Navegación */}
      <nav className="flex flex-col">
        <Link href="/" onClick={onNavigate} className={linkClass("/")}>
          <ChartBarIcon className={iconClass("/")} />
          Principal
        </Link>

        <Link
          href="/inventario"
          onClick={onNavigate}
          className={linkClass("/inventario")}
        >
          <CubeIcon className={iconClass("/inventario")} />
          Inventario
        </Link>

        <Link href="/chat" onClick={onNavigate} className={linkClass("/chat")}>
          <ChatBubbleLeftRightIcon className={iconClass("/chat")} />
          Chat IA
        </Link>

        <Link
          href="/reportes"
          onClick={onNavigate}
          className={linkClass("/reportes")}
        >
          <DocumentChartBarIcon className={iconClass("/reportes")} />
          Reportes
        </Link>

        {isReady && user?.role === "user" && (
          <Link
            href="/tienda"
            onClick={onNavigate}
            className={linkClass("/tienda")}
          >
            <ShoppingCartIcon className={iconClass("/tienda")} />
            Tienda
          </Link>
        )}

        {isReady && esAdmin && (
          <Link
            href="/ventas"
            onClick={onNavigate}
            className={linkClass("/ventas")}
          >
            <ReceiptPercentIcon className={iconClass("/ventas")} />
            Ventas
          </Link>
        )}

        {isReady && user?.role === "super_admin" && (
          <Link
            href="/usuarios"
            onClick={onNavigate}
            className={linkClass("/usuarios")}
          >
            <UsersIcon className={iconClass("/usuarios")} />
            Usuarios
          </Link>
        )}

        {isReady && esAdmin && (
          <Link
            href="/agregar"
            onClick={onNavigate}
            className={linkClass("/agregar")}
          >
            <PlusCircleIcon className={iconClass("/agregar")} />
            Agregar Producto
          </Link>
        )}
      </nav>

      {/* Footer */}
      <div className="mt-auto pt-6 text-xs text-naranja2 opacity-70 lg:text-sm">
        Bell Assistant v1.4
      </div>
    </aside>
  );
}
