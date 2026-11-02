"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/context/AuthContext";

import {
  ChartBarIcon,
  CubeIcon,
  ChatBubbleLeftRightIcon,
  LinkIcon,
} from "@heroicons/react/24/outline";

export default function Sidebar() {
  const path = usePathname();
  const router = useRouter();
  const { logout } = useAuth();

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  const linkClass = (route: string) =>
    `flex items-center gap-3 px-6 py-3 rounded-md mb-2 transition font-semibold
    ${
      path === route
        ? "!bg-orange-500 !text-black"
        : "text-naranja2 hover:bg-fondo"
    }`;

  const iconClass = (route: string) =>
    `w-6 h-6 transition ${
      path === route ? "!text-black" : "text-naranja2"
    }`;


  return (
    <aside className="w-64 h-screen bg-fondo2 border-r border-naranja2 p-6 flex flex-col">

      {/* Logo */}
      <div className="flex flex-col items-center mb-10">
        <Image
          src="/logo-bell.png"
          alt="Logo Bell IA"
          width={160}
          height={160}
          className="object-contain"
          loading="eager"
        />
      </div>

      {/* Navegación */}
      <nav className="flex flex-col">

        <Link href="/" className={linkClass("/")}>
          <ChartBarIcon className={iconClass("/")} />
          Principal
        </Link>

        <Link href="/inventario" className={linkClass("/inventario")}>
          <CubeIcon className={iconClass("/inventario")} />
          Inventario
        </Link>

        <Link href="/chat" className={linkClass("/chat")}>
          <ChatBubbleLeftRightIcon className={iconClass("/chat")} />
          Chat IA
        </Link>

        <Link href="/login" className={linkClass("/login")}>
          <LinkIcon className={iconClass("/login")} />
          Login
        </Link>

      </nav>

      {/* Cerrar sesión */}
      <button
        onClick={handleLogout}
        className="w-full flex items-center gap-2 px-6 py-3 rounded-md text-sm font-semibold text-red-400 hover:bg-red-500/20 transition border border-transparent hover:border-red-500/50 mt-4"
      >
        <span>🚪</span> Cerrar sesión
      </button>

      {/* Footer */}
      <div className="mt-auto text-sm text-naranja2 opacity-70">
        Bell Assistant v1.3
      </div>

    </aside>
  );
}
