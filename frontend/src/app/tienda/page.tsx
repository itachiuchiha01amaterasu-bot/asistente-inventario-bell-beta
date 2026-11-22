"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MagnifyingGlassIcon,
  ShoppingCartIcon,
} from "@heroicons/react/24/outline";

import { useAuth } from "@/context/AuthContext";
import { API_URL } from "@/lib/api";
import {
  descripcionItem,
  formatearFechaHora,
  stockVendible,
  type Compra,
} from "@/lib/compras";
import {
  badgeEstadoVencimiento,
  estadoVencimiento,
  fechaVencimiento,
  formatearFecha,
  textoEstadoVencimiento,
  type VarianteVencimiento,
} from "@/lib/vencimientos";

type Variante = Omit<VarianteVencimiento, "product_name" | "category">;

type Producto = {
  id: number;
  name: string;
  category: string | null;
  variants: Variante[];
};

type VarianteTienda = Variante & {
  product_name: string;
  category: string | null;
  vendible: number;
};

type PorComprar = {
  variante: VarianteTienda;
  cantidad: number;
};

async function obtenerInventario(token: string): Promise<Producto[]> {
  const res = await fetch(`${API_URL}/api/inventario`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error("No se pudo cargar el inventario");

  const datos = await res.json();
  return datos.productos || [];
}

async function obtenerCompras(token: string): Promise<Compra[]> {
  const res = await fetch(`${API_URL}/api/compras`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error("No se pudo cargar el historial de compras");

  const datos = await res.json();
  return datos.compras || [];
}

export default function Tienda() {
  const { user, token, isAuthenticated, isReady } = useAuth();
  const router = useRouter();

  const [productos, setProductos] = useState<Producto[]>([]);
  const [compras, setCompras] = useState<Compra[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [cantidades, setCantidades] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [porComprar, setPorComprar] = useState<PorComprar | null>(null);
  const [comprando, setComprando] = useState(false);
  const [errorCompra, setErrorCompra] = useState<string | null>(null);

  const esCliente = user?.role === "user";

  useEffect(() => {
    if (!isReady) return;

    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }

    if (!esCliente) {
      router.replace("/");
    }
  }, [isReady, isAuthenticated, esCliente, router]);

  useEffect(() => {
    if (!esCliente || !token) return;

    let cancelado = false;

    Promise.all([obtenerInventario(token), obtenerCompras(token)])
      .then(([inventario, historial]) => {
        if (cancelado) return;
        setProductos(inventario);
        setCompras(historial);
        setError(null);
      })
      .catch((e) => {
        if (cancelado) return;
        setError(
          e instanceof Error ? e.message : "No se pudieron cargar los productos"
        );
      })
      .finally(() => {
        if (!cancelado) setLoading(false);
      });

    return () => {
      cancelado = true;
    };
  }, [esCliente, token]);

  const variantes = useMemo<VarianteTienda[]>(() => {
    return productos
      .flatMap((producto) =>
        producto.variants.map((variante) => ({
          ...variante,
          product_name: producto.name,
          category: producto.category,
          vendible: stockVendible(variante.batches),
        }))
      )
      .sort(
        (a, b) =>
          Number(b.vendible > 0) - Number(a.vendible > 0) ||
          a.product_name.localeCompare(b.product_name, "es") ||
          (a.brand || "").localeCompare(b.brand || "", "es")
      );
  }, [productos]);

  const variantesFiltradas = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    if (!texto) return variantes;

    return variantes.filter((v) =>
      `${v.product_name} ${v.brand || ""} ${v.category || ""} ${
        v.type_variety || ""
      }`
        .toLowerCase()
        .includes(texto)
    );
  }, [variantes, busqueda]);

  const totalCompras = compras.reduce(
    (total, compra) => total + compra.total_units,
    0
  );

  const cantidadDe = (variante: VarianteTienda) =>
    Math.min(cantidades[variante.variant_id] ?? 1, variante.vendible);

  const cambiarCantidad = (variante: VarianteTienda, valor: string) => {
    const numero = Number.parseInt(valor, 10);

    if (!Number.isFinite(numero)) {
      setCantidades((c) => ({ ...c, [variante.variant_id]: 1 }));
      return;
    }

    const limitada = Math.max(1, Math.min(variante.vendible, numero));
    setCantidades((c) => ({ ...c, [variante.variant_id]: limitada }));
  };

  const abrirCompra = (variante: VarianteTienda) => {
    if (variante.vendible <= 0) return;

    setPorComprar({ variante, cantidad: cantidadDe(variante) });
    setErrorCompra(null);
  };

  const recargar = async () => {
    if (!token) return;

    const [inventario, historial] = await Promise.all([
      obtenerInventario(token),
      obtenerCompras(token),
    ]);

    setProductos(inventario);
    setCompras(historial);
  };

  const confirmarCompra = async () => {
    if (!token || !porComprar) return;

    setComprando(true);
    setErrorCompra(null);

    try {
      const res = await fetch(`${API_URL}/api/compras`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          items: [
            {
              variant_id: porComprar.variante.variant_id,
              quantity: porComprar.cantidad,
            },
          ],
        }),
      });

      const datos = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(datos.error || "No se pudo registrar la compra");
      }

      const nombre = porComprar.variante.product_name;
      const cantidad = porComprar.cantidad;

      setPorComprar(null);
      setAviso(
        `Compra registrada: ${cantidad} unidad(es) de ${nombre}.`
      );
      await recargar();

      window.setTimeout(() => setAviso(null), 5000);
    } catch (e) {
      setErrorCompra(
        e instanceof Error ? e.message : "No se pudo registrar la compra"
      );
    } finally {
      setComprando(false);
    }
  };

  if (!isReady || !isAuthenticated || !esCliente) return null;

  return (
    <div className="space-y-6 lg:space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-orange-400 sm:text-3xl lg:text-4xl">
          Tienda
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-gray-400 sm:text-base">
          Elige los productos que necesitas. La compra se registra al instante
          y descuenta el stock disponible.
        </p>
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

      <div className="flex flex-col gap-3 rounded-xl border border-[#2a2a2a] bg-[#1b1b1b] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-400">
          <span className="inline-flex items-center gap-2">
            <ShoppingCartIcon className="h-5 w-5 text-orange-400" />
            {variantes.length} producto(s)
          </span>
          <span>
            {compras.length} compra(s) · {totalCompras} unidad(es)
          </span>
        </div>

        <label className="relative w-full sm:max-w-xs">
          <span className="sr-only">Buscar producto</span>
          <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar producto, marca o rubro"
            className="w-full rounded-lg border border-[#3a3a3a] bg-[#111] py-2 pl-10 pr-3 text-sm text-gray-100 placeholder:text-gray-500 focus:border-orange-500 focus:outline-none"
          />
        </label>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-52 animate-pulse rounded-xl bg-[#1b1b1b]"
            />
          ))}
        </div>
      ) : variantesFiltradas.length === 0 ? (
        <p className="rounded-xl border border-[#2a2a2a] bg-[#1b1b1b] p-6 text-center text-gray-500">
          No hay productos que coincidan con la búsqueda.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {variantesFiltradas.map((variante) => {
            const vencimiento = fechaVencimiento(variante.batches);
            const estado = estadoVencimiento(vencimiento);
            const agotado = variante.vendible <= 0;
            const noVendibles =
              variante.total_quantity - variante.vendible;

            return (
              <li
                key={variante.variant_id}
                className={`flex flex-col rounded-xl border bg-[#1b1b1b] p-4 shadow-lg sm:p-5 ${
                  agotado
                    ? "border-[#2a2a2a] opacity-75"
                    : "border-[#2a2a2a]"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-semibold text-gray-100">
                      {variante.product_name}
                    </h2>
                    <p className="mt-0.5 truncate text-sm text-gray-400">
                      {[variante.brand, variante.type_variety]
                        .filter(Boolean)
                        .join(" · ") || "Sin marca"}
                    </p>
                  </div>

                  {variante.category && (
                    <span className="shrink-0 rounded-full border border-[#3a3a3a] bg-[#111] px-2.5 py-0.5 text-xs text-gray-400">
                      {variante.category}
                    </span>
                  )}
                </div>

                <p className="mt-2 text-sm text-gray-500">
                  {variante.content_value !== null && variante.content_unit
                    ? `${variante.content_value} ${variante.content_unit}`
                    : "Contenido por definir"}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                      agotado
                        ? "border-[#3a3a3a] bg-[#111] text-gray-400"
                        : "border-green-500/40 bg-green-500/15 text-green-300"
                    }`}
                  >
                    {agotado
                      ? "Agotado"
                      : `${variante.vendible} disponible(s)`}
                  </span>

                  {vencimiento && !agotado && (
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${badgeEstadoVencimiento(estado)}`}
                      title={`Vence ${formatearFecha(vencimiento)}`}
                    >
                      {textoEstadoVencimiento(estado)}
                    </span>
                  )}
                </div>

                {noVendibles > 0 && (
                  <p className="mt-2 text-xs text-gray-500">
                    {noVendibles} unidad(es) vencida(s) no se venden.
                  </p>
                )}

                <div className="mt-auto flex items-end gap-2 border-t border-[#2a2a2a] pt-4">
                  <label className="w-24">
                    <span className="mb-1 block text-xs text-gray-500">
                      Cantidad
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={Math.max(variante.vendible, 1)}
                      value={cantidadDe(variante)}
                      onChange={(e) =>
                        cambiarCantidad(variante, e.target.value)
                      }
                      disabled={agotado}
                      className="w-full rounded-lg border border-[#3a3a3a] bg-[#111] px-3 py-2 text-sm text-gray-100 focus:border-orange-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => abrirCompra(variante)}
                    disabled={agotado}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-orange-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 disabled:cursor-not-allowed disabled:bg-[#333] disabled:text-gray-500"
                  >
                    <ShoppingCartIcon className="h-5 w-5" />
                    {agotado ? "Sin stock" : "Comprar"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* MIS COMPRAS */}
      <section className="rounded-xl border border-[#2a2a2a] bg-[#1b1b1b] p-4 shadow-lg sm:p-6">
        <h2 className="text-xl font-semibold text-orange-300 sm:text-2xl">
          Mis compras
        </h2>
        <p className="mt-1 text-sm text-gray-400">
          Historial de las compras registradas con tu cuenta.
        </p>

        {compras.length === 0 ? (
          <p className="mt-4 rounded-lg border border-[#2a2a2a] bg-[#111] p-4 text-sm text-gray-500">
            Todavía no registraste ninguna compra.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {compras.map((compra) => (
              <li
                key={compra.id}
                className="rounded-lg border border-[#2a2a2a] bg-[#111] p-3 sm:p-4"
              >
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-100">
                      Compra #{compra.id}
                      <span className="ml-2 text-sm font-normal text-gray-500">
                        {formatearFechaHora(compra.created_at)}
                      </span>
                    </p>
                    <p className="mt-0.5 text-sm text-gray-400">
                      {compra.total_units} unidad(es) en total
                    </p>
                  </div>
                </div>

                <ul className="mt-2 space-y-1 text-sm text-gray-300">
                  {compra.items.map((item, indice) => (
                    <li
                      key={`${compra.id}-${item.variant_id ?? indice}`}
                      className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between"
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
      </section>

      {/* MODAL CONFIRMAR COMPRA */}
      {porComprar && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="titulo-confirmar-compra"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !comprando) {
              setPorComprar(null);
            }
          }}
        >
          <div className="w-full max-w-md rounded-xl border border-orange-500/40 bg-[#1b1b1b] p-5 shadow-2xl sm:p-6">
            <h2
              id="titulo-confirmar-compra"
              className="text-xl font-semibold text-orange-300"
            >
              Confirmar compra
            </h2>

            <div className="mt-4 rounded-lg border border-[#2a2a2a] bg-[#111] p-3">
              <p className="font-semibold text-gray-100">
                {porComprar.variante.product_name}
              </p>
              <p className="mt-0.5 text-sm text-gray-400">
                {[porComprar.variante.brand, porComprar.variante.type_variety]
                  .filter(Boolean)
                  .join(" · ") || "Sin marca"}
              </p>
              <p className="mt-2 text-sm text-gray-300">
                {porComprar.cantidad} unidad(es) ·{" "}
                <span className="text-gray-500">
                  {porComprar.variante.vendible} disponible(s)
                </span>
              </p>
            </div>

            <p className="mt-4 text-sm text-gray-400">
              La compra se registra al instante y el stock se descuenta
              automáticamente. No se puede deshacer.
            </p>

            {errorCompra && (
              <p
                role="alert"
                className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200"
              >
                {errorCompra}
              </p>
            )}

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setPorComprar(null)}
                disabled={comprando}
                className="rounded-lg border border-[#3a3a3a] bg-[#111] px-4 py-2 text-sm font-semibold text-gray-300 transition hover:bg-[#222] disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarCompra}
                disabled={comprando}
                className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {comprando ? "Registrando..." : "Confirmar compra"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
