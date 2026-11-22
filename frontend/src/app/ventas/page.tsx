"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  MagnifyingGlassIcon,
  ReceiptPercentIcon,
} from "@heroicons/react/24/outline";

import { useAuth } from "@/context/AuthContext";
import { API_URL } from "@/lib/api";
import {
  descripcionItem,
  filasVentas,
  formatearFechaHora,
  type Compra,
} from "@/lib/compras";
import { descargarCSV, nombreReporte } from "@/lib/reportes";

export default function Ventas() {
  const { user, token, isAuthenticated, isReady } = useAuth();
  const router = useRouter();

  const [compras, setCompras] = useState<Compra[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const esAdmin = user?.role === "admin" || user?.role === "super_admin";

  useEffect(() => {
    if (!isReady) return;

    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }

    if (!esAdmin) {
      router.replace("/");
    }
  }, [isReady, isAuthenticated, esAdmin, router]);

  useEffect(() => {
    if (!esAdmin || !token) return;

    let cancelado = false;

    fetch(`${API_URL}/api/compras`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("No se pudo cargar el historial de ventas");
        return res.json();
      })
      .then((datos) => {
        if (cancelado) return;
        setCompras(datos.compras || []);
        setError(null);
      })
      .catch((e) => {
        if (cancelado) return;
        setError(
          e instanceof Error
            ? e.message
            : "No se pudo cargar el historial de ventas"
        );
      })
      .finally(() => {
        if (!cancelado) setLoading(false);
      });

    return () => {
      cancelado = true;
    };
  }, [esAdmin, token]);

  const recargar = async () => {
    if (!token) return;

    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/compras`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error("No se pudo cargar el historial de ventas");

      const datos = await res.json();
      setCompras(datos.compras || []);
      setError(null);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No se pudo cargar el historial de ventas"
      );
    } finally {
      setLoading(false);
    }
  };

  const comprasFiltradas = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    if (!texto) return compras;

    return compras.filter((compra) => {
      const productos = compra.items
        .map((item) => `${item.product_name} ${item.brand || ""}`)
        .join(" ");

      return `${compra.id} ${compra.username} ${productos}`
        .toLowerCase()
        .includes(texto);
    });
  }, [compras, busqueda]);

  const unidades = compras.reduce(
    (total, compra) => total + compra.total_units,
    0
  );

  const compradores = new Set(compras.map((c) => c.username)).size;

  const productoTop = useMemo(() => {
    const conteo = new Map<string, number>();

    for (const compra of compras) {
      for (const item of compra.items) {
        conteo.set(
          item.product_name,
          (conteo.get(item.product_name) || 0) + item.quantity
        );
      }
    }

    const ordenados = [...conteo.entries()].sort((a, b) => b[1] - a[1]);
    return ordenados[0] ?? null;
  }, [compras]);

  const descargar = () => {
    const nombre = nombreReporte("ventas");
    descargarCSV(nombre, filasVentas(compras));
    setAviso(`Reporte descargado: ${nombre}`);
    window.setTimeout(() => setAviso(null), 4000);
  };

  if (!isReady || !isAuthenticated || !esAdmin) return null;

  return (
    <div className="space-y-6 lg:space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-orange-400 sm:text-3xl lg:text-4xl">
            Ventas
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-gray-400 sm:text-base">
            Compras registradas por los usuarios. El stock ya fue descontado al
            confirmar cada compra.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={recargar}
            className="inline-flex items-center gap-2 rounded-lg border border-[#3a3a3a] bg-[#111] px-4 py-2 text-sm font-semibold text-gray-300 transition hover:border-orange-500/60 hover:text-orange-300"
          >
            <ArrowPathIcon className="h-5 w-5" />
            Actualizar
          </button>

          <button
            type="button"
            onClick={descargar}
            disabled={compras.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ArrowDownTrayIcon className="h-5 w-5" />
            Exportar CSV
          </button>
        </div>
      </div>

      {aviso && (
        <div
          role="status"
          className="flex items-start justify-between gap-3 rounded-lg border border-green-500/40 bg-green-500/10 px-4 py-3 text-sm text-green-200"
        >
          <span className="min-w-0 break-words">{aviso}</span>
          <button
            type="button"
            onClick={() => setAviso(null)}
            aria-label="Cerrar aviso"
            className="shrink-0 rounded px-2 py-0.5 transition hover:bg-green-500/20"
          >
            ✕
          </button>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200"
        >
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-[#2a2a2a] bg-[#1b1b1b] p-4 shadow-lg sm:p-5">
          <p className="text-sm text-gray-400">Compras registradas</p>
          <p className="mt-1 text-3xl font-bold text-orange-400">
            {compras.length}
          </p>
        </div>

        <div className="rounded-xl border border-[#2a2a2a] bg-[#1b1b1b] p-4 shadow-lg sm:p-5">
          <p className="text-sm text-gray-400">Unidades vendidas</p>
          <p className="mt-1 text-3xl font-bold text-orange-400">{unidades}</p>
        </div>

        <div className="rounded-xl border border-[#2a2a2a] bg-[#1b1b1b] p-4 shadow-lg sm:p-5">
          <p className="text-sm text-gray-400">Compradores</p>
          <p className="mt-1 text-3xl font-bold text-orange-400">
            {compradores}
          </p>
        </div>

        <div className="rounded-xl border border-[#2a2a2a] bg-[#1b1b1b] p-4 shadow-lg sm:p-5">
          <p className="text-sm text-gray-400">Producto más vendido</p>
          <p className="mt-1 truncate text-lg font-bold text-orange-400">
            {productoTop ? productoTop[0] : "—"}
          </p>
          {productoTop && (
            <p className="mt-1 text-xs text-gray-500">
              {productoTop[1]} unidad(es)
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-[#2a2a2a] bg-[#1b1b1b] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <ReceiptPercentIcon className="h-5 w-5 text-orange-400" />
          {comprasFiltradas.length} compra(s) en pantalla
        </div>

        <label className="relative w-full sm:max-w-xs">
          <span className="sr-only">Buscar venta</span>
          <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por usuario o producto"
            className="w-full rounded-lg border border-[#3a3a3a] bg-[#111] py-2 pl-10 pr-3 text-sm text-gray-100 placeholder:text-gray-500 focus:border-orange-500 focus:outline-none"
          />
        </label>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-xl bg-[#1b1b1b]"
            />
          ))}
        </div>
      ) : comprasFiltradas.length === 0 ? (
        <p className="rounded-xl border border-[#2a2a2a] bg-[#1b1b1b] p-6 text-center text-gray-500">
          {compras.length === 0
            ? "Todavía no hay ventas registradas."
            : "No hay ventas que coincidan con la búsqueda."}
        </p>
      ) : (
        <ul className="space-y-3">
          {comprasFiltradas.map((compra) => (
            <li
              key={compra.id}
              className="rounded-xl border border-[#2a2a2a] bg-[#1b1b1b] p-4 shadow-lg sm:p-5"
            >
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-100">
                    Compra #{compra.id}
                    <span className="ml-2 text-sm font-normal text-orange-300">
                      {compra.username}
                    </span>
                  </p>
                  <p className="mt-0.5 text-sm text-gray-500">
                    {formatearFechaHora(compra.created_at)}
                  </p>
                </div>

                <span className="self-start rounded-full border border-orange-500/40 bg-orange-500/15 px-3 py-1 text-xs font-semibold text-orange-300 sm:self-auto">
                  {compra.total_units} unidad(es)
                </span>
              </div>

              <ul className="mt-3 divide-y divide-[#2a2a2a] overflow-hidden rounded-lg border border-[#2a2a2a] bg-[#111]">
                {compra.items.map((item, indice) => (
                  <li
                    key={`${compra.id}-${item.variant_id ?? indice}`}
                    className="flex flex-col gap-0.5 p-3 text-sm sm:flex-row sm:items-baseline sm:justify-between"
                  >
                    <span className="min-w-0 break-words">
                      <strong className="text-orange-300">
                        {item.quantity} ×
                      </strong>{" "}
                      {item.product_name}{" "}
                      <span className="text-gray-500">
                        ({descripcionItem(item)})
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
