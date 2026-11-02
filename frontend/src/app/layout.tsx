import "./globals.css";
import type { ReactNode } from "react";
import Sidebar from "../components/Sidebar";
import DateDisplay from "../components/DateDisplay";
import { ChatProvider } from "@/context/ChatContext";
import { CalendarIcon } from "@heroicons/react/24/outline";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AuthProvider } from "@/context/AuthContext";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Gestión de Inventario",
  description: "Sistema de inventario con asistente IA",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={inter.className}>
        <AuthProvider>
          <ChatProvider>
            <div className="flex h-screen">
              <Sidebar />

              <div className="flex-1 flex flex-col">
                <header className="w-full h-16 bg-[#141414] border-b border-[#2a2a2a] flex items-center px-8 shadow-md justify-between">
                  <h2 className="text-2xl font-semibold text-orange-400">
                    Gestión de Inventario
                  </h2>

                  <div className="flex items-center gap-2 bg-gradient-to-br from-[#1b1b1b] to-[#141414] px-4 py-2 rounded-xl border border-[#2a2a2a] shadow-md">
                    <CalendarIcon className="w-6 h-6 text-orange-500" />
                    <DateDisplay />
                  </div>
                </header>

                <main className="flex-1 p-10 overflow-y-auto bg-[#0f0f0f]">
                  {children}
                </main>
              </div>
            </div>
          </ChatProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
