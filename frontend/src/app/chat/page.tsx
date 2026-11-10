"use client";

import { useState, useRef, useEffect } from "react";
import { useChat } from "@/context/ChatContext";
import { useAuth } from "@/context/AuthContext";
import { API_URL } from "@/lib/api";

type Mensaje = { emisor: "tú" | "ia"; texto: string };

export default function Chat() {
  const [mensaje, setMensaje] = useState("");
  const { chat, setChat, typing, setTyping } = useChat();
  const { token, user } = useAuth();
  const soloConsulta = user?.role === "user";
  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const enviar = async () => {
    const texto = mensaje.trim();
    if (!texto || typing) return;

    inputRef.current?.classList.add("animate-[shake_.2s]");
    setTimeout(() => inputRef.current?.classList.remove("animate-[shake_.2s]"), 200);

    setChat((prev: Mensaje[]) => [...prev, { emisor: "tú", texto }]);
    setMensaje("");
    setTyping(true);

    // Cortar la espera si el backend no responde, para no dejar el "..." eterno.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 125000);

    try {
      const res = await fetch(`${API_URL}/asistente_ia`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ mensaje: texto }),
        signal: controller.signal,
      });

      let data: { respuesta?: string } = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }

      if (!res.ok) {
        setChat((prev: Mensaje[]) => [
          ...prev,
          {
            emisor: "ia",
            texto:
              data.respuesta ||
              `El servidor respondió con un error (${res.status}). Intenta de nuevo.`,
          },
        ]);
        return;
      }

      setChat((prev: Mensaje[]) => [
        ...prev,
        {
          emisor: "ia",
          texto: data.respuesta || "No recibí respuesta del asistente.",
        },
      ]);
    } catch (error) {
      const abortado = (error as { name?: string })?.name === "AbortError";
      setChat((prev: Mensaje[]) => [
        ...prev,
        {
          emisor: "ia",
          texto: abortado
            ? "La respuesta tardó demasiado. Intenta de nuevo en unos segundos."
            : "No pude conectar con el servidor. Revisa tu conexión e intenta de nuevo.",
        },
      ]);
    } finally {
      clearTimeout(timeoutId);
      setTyping(false);
    }
  };

  const borrarChat = () => {
    localStorage.removeItem("chatBell");
    setChat([{ emisor: "ia", texto: "Hola, ¿en qué te ayudo hoy?" }]);
  };

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTo({
        top: chatRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [chat, typing]);

  return (
    <div className="flex h-full min-h-[calc(100dvh-9rem)] flex-col space-y-4 lg:min-h-0 lg:space-y-6">

      {/* Título + borrar */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="min-w-0 truncate text-2xl font-bold tracking-tight text-orange-400 sm:text-3xl lg:text-4xl">
          Asistente Bell
        </h1>

        <button
          onClick={borrarChat}
          className="shrink-0 rounded-lg border border-[#3a3a3a] bg-[#2a2a2a] px-3 py-2 text-xs text-gray-300 transition hover:bg-red-600 hover:text-white sm:px-4 sm:text-sm"
        >
          Borrar chat
        </button>
      </div>

      {soloConsulta && (
        <div className="rounded-lg border border-orange-500/40 bg-orange-500/10 px-3 py-2 text-xs text-orange-200 sm:px-4 sm:text-sm">
          Modo consulta: puedes preguntar por el inventario, pero no agregar,
          editar ni eliminar productos.
        </div>
      )}

      {/* Contenedor del chat */}
      <div
        ref={chatRef}
        className="min-h-[280px] flex-1 space-y-4 overflow-y-auto rounded-xl border border-[#2a2a2a] bg-[#1b1b1b] p-3 shadow-lg sm:p-6"
      >
        {/* Pantalla de chat vacío */}
        {chat.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <p className="text-lg">Tu asistente Bell está listo</p>
            <p className="text-sm opacity-70">Escribe un mensaje para comenzar</p>
          </div>
        )}

        {/* Mensajes */}
        {chat.map((msg: Mensaje, i: number) => (
          <div
            key={i}
            className={`max-w-[85%] break-words rounded-2xl px-3 py-2.5 text-sm leading-relaxed shadow-lg transition-all duration-200 animate-[fadeIn_.25s_ease-out] whitespace-pre-wrap sm:max-w-xl sm:px-4 sm:py-3 ${
              msg.emisor === "tú"
                ? "bg-gradient-to-br from-orange-600 to-orange-500 text-white self-end ml-auto"
                : "bg-[#2a2a2a] text-gray-200 self-start mr-auto"
            }`}
          >
            {msg.texto}
          </div>
        ))}

        {/* Animación typing */}
        {typing && (
          <div className="flex gap-1 items-center bg-[#2a2a2a] px-4 py-3 rounded-xl w-14 animate-[fadeIn_.25s_ease-out]">
            <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></span>
            <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-150"></span>
            <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-300"></span>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="flex gap-2 sm:gap-3">
        <input
          ref={inputRef}
          className="min-w-0 flex-1 rounded-xl border border-[#2a2a2a] bg-[#111] p-3.5 text-base text-white transition focus:outline-none focus:ring-2 focus:ring-orange-500 sm:p-4"
          placeholder="Escribe un mensaje..."
          value={mensaje}
          onChange={(e) => setMensaje(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !typing && enviar()}
        />

        <button
          onClick={enviar}
          disabled={typing || !mensaje.trim()}
          className="shrink-0 whitespace-nowrap rounded-xl bg-orange-600 px-4 font-semibold shadow-md transition hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-50 sm:px-8"
        >
          Enviar
        </button>
      </div>

    </div>
  );
}
