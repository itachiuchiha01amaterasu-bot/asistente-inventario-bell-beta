import "./globals.css";
import type { ReactNode } from "react";
import AppShell from "../components/AppShell";
import { ChatProvider } from "@/context/ChatContext";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { AuthProvider } from "@/context/AuthContext";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Gestión de Inventario",
  description: "Sistema de inventario con asistente IA",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f0f0f",
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
            <AppShell>{children}</AppShell>
          </ChatProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
