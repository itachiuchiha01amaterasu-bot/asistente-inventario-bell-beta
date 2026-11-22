"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import EditarVariante from "../../components/EditarInv";
import { PencilSquareIcon, TrashIcon } from "@heroicons/react/24/solid";
import { useAuth } from "@/context/AuthContext";
import { API_URL } from "@/lib/api";
import { formatearPrecio } from "@/lib/precios";
import {
  badgeEstadoVencimiento,
  claseEstadoVencimiento,
  estadoVencimiento,
  fechaIngreso,
  fechaVencimiento,
  filtrarPorVencimiento,
  formatearFecha,
  loteDelVencimiento,
  lotesOrdenados,
  resumirVencimientos,
  textoEstadoVencimiento,
  type FiltroVencimiento,
} from "@/lib/vencimientos";

type Lote = {
  id: number;
  quantity: number;
  arrival_date: string;
  expiration_date: string | null;
};

type Variante = {
  variant_id: number;
  brand: string;
  type_variety: string;
  content_value: number;
  content_unit: string;
  sku_code: string;
  total_quantity: number;
  price: number | null;
  batches: Lote[];
  product_name: string;
  category: string;
};

type Producto = {
  id: number;
  name: string;
  category: string;
  variants: Omit<Variante, "product_name" | "category">[];
};

export default function Inventario() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [filtroVencimiento, setFiltroVencimiento] =
    useState<FiltroVencimiento>("todos");
  const [orden, setOrden] = useState<string | null>(null);
  const [direccion, setDireccion] = useState<"asc" | "desc">("asc");
  const [loading, setLoading] = useState(true);

  const [editando, setEditando] = useState<Variante | null>(null);
  const [formEdit, setFormEdit] = useState<any>({});
  const { token, user } = useAuth();

  // Solo admin y super_admin ven y usan editar/eliminar. El backend vuelve
  // a validarlo, así que ocultarlo no es la única protección.
  const puedeGestionar = user?.role === "admin" || user?.role === "super_admin";

  const [porEliminar, setPorEliminar] = useState<Variante | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const recargarInventario = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/inventario`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) return;

      const data = await res.json();
      setProductos(data.productos || []);
    } catch {
      // Si falla la recarga se mantiene lo que ya está en pantalla.
    }
  }, [token]);

  useEffect(() => {
    recargarInventario().finally(() => setLoading(false));
  }, [recargarInventario]);

  // Si se llega desde el panel con ?alerta=..., se aplica ese filtro al
  // abrir el inventario (alertas, vencidos, por_vencer o sin_fecha).
  useEffect(() => {
    const alerta = new URLSearchParams(window.location.search).get("alerta");
    if (
      alerta === "alertas" ||
      alerta === "vencidos" ||
      alerta === "por_vencer" ||
      alerta === "sin_fecha"
    ) {
      // El filtro inicial viene de la URL: es una sincronización con un
      // sistema externo, no un estado derivado de otro estado.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFiltroVencimiento(alerta);
    }
  }, []);

  // Cerrar el diálogo de eliminar con Escape.
  useEffect(() => {
    if (!porEliminar) return;

    const alPresionar = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !eliminando) {
        setPorEliminar(null);
        setErrorEliminar(null);
      }
    };

    window.addEventListener("keydown", alPresionar);
    return () => window.removeEventListener("keydown", alPresionar);
  }, [porEliminar, eliminando]);

  const variantes = useMemo(() => {
    return productos.flatMap((p) =>
      p.variants.map((v) => ({
        ...v,
        product_name: p.name,
        category: p.category,
      }))
    );
  }, [productos]);

  const resumen = useMemo(() => resumirVencimientos(variantes), [variantes]);

  const filtrosVencimiento: {
    id: FiltroVencimiento;
    texto: string;
    cantidad: number;
  }[] = [
    { id: "todos", texto: "Todos", cantidad: resumen.totalVariantes },
    {
      id: "alertas",
      texto: "Con alertas",
      cantidad: resumen.variantesConAlerta,
    },
    { id: "vencidos", texto: "Vencidos", cantidad: resumen.variantesVencidas },
    {
      id: "por_vencer",
      texto: "Por vencer (30 días)",
      cantidad: resumen.variantesPorVencer,
    },
    {
      id: "sin_fecha",
      texto: "Sin fecha",
      cantidad: resumen.variantesSinFecha,
    },
  ];

  const variantesConTotales = variantes.map((v) => ({
    ...v,
    total: v.total_quantity,
  }));

  const stockMinimo =
    variantesConTotales.length > 0
      ? variantesConTotales.reduce((min, v) => (v.total < min.total ? v : min))
      : null;

  const stockMaximo =
    variantesConTotales.length > 0
      ? variantesConTotales.reduce((max, v) => (v.total > max.total ? v : max))
      : null;

  const variantesFiltradas = useMemo(() => {
    const porTexto = variantes.filter((v) => {
      const fechas = v.batches
        .map((b) => `${b.arrival_date} ${b.expiration_date ?? ""}`)
        .join(" ");

      const texto = `
        ${v.category}
        ${v.product_name}
        ${v.brand}
        ${v.type_variety}
        ${v.content_value} ${v.content_unit}
        ${fechas}
      `.toLowerCase();

      return texto.includes(busqueda.toLowerCase());
    });

    return filtrarPorVencimiento(porTexto, filtroVencimiento);
  }, [variantes, busqueda, filtroVencimiento]);

  const ordenarPor = (columna: string) => {
    if (orden === columna) {
      setDireccion(direccion === "asc" ? "desc" : "asc");
    } else {
      setOrden(columna);
      setDireccion("asc");
    }
  };

  const variantesOrdenadas = useMemo(() => {
    if (!orden) return variantesFiltradas;

    return [...variantesFiltradas].sort((a, b) => {
      if (orden === "total_quantity") {
        return direccion === "asc"
          ? a.total_quantity - b.total_quantity
          : b.total_quantity - a.total_quantity;
      }

      if (orden === "fecha_ingreso") {
        const fechaA = new Date(fechaIngreso(a.batches) || "9999-12-31").getTime();
        const fechaB = new Date(fechaIngreso(b.batches) || "9999-12-31").getTime();
        return direccion === "asc" ? fechaA - fechaB : fechaB - fechaA;
      }

      if (orden === "fecha_caducidad") {
        const fechaA = new Date(fechaVencimiento(a.batches) || "9999-12-31").getTime();
        const fechaB = new Date(fechaVencimiento(b.batches) || "9999-12-31").getTime();
        return direccion === "asc" ? fechaA - fechaB : fechaB - fechaA;
      }

      if (orden === "price") {
        // Los productos sin precio van siempre al final.
        if (a.price === null) return 1;
        if (b.price === null) return -1;

        return direccion === "asc" ? a.price - b.price : b.price - a.price;
      }

      const A = String((a as any)[orden] ?? "").toLowerCase();
      const B = String((b as any)[orden] ?? "").toLowerCase();

      return direccion === "asc" ? A.localeCompare(B) : B.localeCompare(A);
    });
  }, [variantesFiltradas, orden, direccion]);

  async function guardarCambios() {
    if (!editando) return;

    const res = await fetch(
      `${API_URL}/api/editar_variante/${editando.variant_id}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formEdit),
      }
    );

    if (res.ok) {
      alert("Producto actualizado correctamente");
      setEditando(null);

      fetch(`${API_URL}/api/inventario`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.json())
        .then((data) => setProductos(data.productos || []));
    } else {
      alert("Error al actualizar");
    }
  }

  async function eliminarProducto() {
    if (!porEliminar) return;

    const nombre = porEliminar.product_name;
    setEliminando(true);
    setErrorEliminar(null);

    try {
      const res = await fetch(
        `${API_URL}/api/variantes/${porEliminar.variant_id}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (res.status === 401 || res.status === 403) {
        setErrorEliminar(
          "Tu cuenta no tiene permiso para eliminar productos del inventario."
        );
        return;
      }

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setErrorEliminar(
          data.error || "No se pudo eliminar el producto. Intenta de nuevo."
        );
        return;
      }

      setPorEliminar(null);
      setAviso(`Se eliminó “${nombre}” del inventario.`);
      await recargarInventario();
    } catch {
      setErrorEliminar(
        "No se pudo conectar con el servidor. Intenta de nuevo."
      );
    } finally {
      setEliminando(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-gray-400 text-xl animate-pulse">
          Cargando inventario...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 lg:space-y-10">
      <h1 className="text-2xl font-bold tracking-tight text-orange-400 sm:text-3xl lg:text-4xl">
        Inventario
      </h1>

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
            className="shrink-0 rounded px-2 py-0.5 text-green-200 transition hover:bg-green-500/20"
          >
            ✕
          </button>
        </div>
      )}

      <input
        type="text"
        placeholder="Buscar por cualquier campo..."
        className="w-full rounded-xl border border-[#2a2a2a] bg-[#111] p-3.5 text-base text-white transition focus:outline-none focus:ring-2 focus:ring-orange-500 sm:p-4"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
      />


      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:gap-6">
        <div className="rounded-xl border border-[#2a2a2a] bg-[#1b1b1b] p-4 shadow-lg sm:p-6">
          <h3 className="text-sm text-gray-400 sm:text-base lg:text-lg">Stock Mínimo</h3>

          {stockMinimo ? (
            <>
              <p className="mt-2 text-3xl font-bold text-red-400 sm:text-4xl">
                {stockMinimo.total} unidades
              </p>
              <p className="text-gray-300 mt-1">
                {stockMinimo.product_name} — {stockMinimo.brand}
              </p>
            </>
          ) : (
            <p className="text-gray-500 mt-2">Sin datos</p>
          )}
        </div>

        <div className="rounded-xl border border-[#2a2a2a] bg-[#1b1b1b] p-4 shadow-lg sm:p-6">
          <h3 className="text-sm text-gray-400 sm:text-base lg:text-lg">Stock Máximo</h3>

          {stockMaximo ? (
            <>
              <p className="mt-2 text-3xl font-bold text-green-400 sm:text-4xl">
                {stockMaximo.total} unidades
              </p>
              <p className="text-gray-300 mt-1">
                {stockMaximo.product_name} — {stockMaximo.brand}
              </p>
            </>
          ) : (
            <p className="text-gray-500 mt-2">Sin datos</p>
          )}
        </div>

        <div className="rounded-xl border border-[#2a2a2a] bg-[#1b1b1b] p-4 shadow-lg sm:p-6">
          <h3 className="text-sm text-gray-400 sm:text-base lg:text-lg">Stock Total</h3>
          <p className="mt-2 text-3xl font-bold text-orange-500 sm:text-4xl lg:text-5xl">
            {variantes.reduce((acc, v) => acc + v.total_quantity, 0)}
          </p>
        </div>

      </div>

      {(resumen.lotesVencidos > 0 || resumen.lotesPorVencer > 0) && (
        <div
          role="status"
          className="flex flex-col gap-3 rounded-xl border border-orange-500/40 bg-orange-500/10 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <p className="font-semibold text-orange-200">
              ⚠️ Revisa los vencimientos
            </p>
            <p className="mt-1 text-sm text-orange-100/80">
              {resumen.lotesVencidos} lote(s) vencido(s) y{" "}
              {resumen.lotesPorVencer} por vencer en los próximos 30 días.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {resumen.lotesVencidos > 0 && (
              <button
                type="button"
                onClick={() => setFiltroVencimiento("vencidos")}
                className="rounded-lg border border-red-500/50 bg-red-500/15 px-3 py-1.5 text-xs font-semibold text-red-200 transition hover:bg-red-500/25 sm:text-sm"
              >
                Ver vencidos
              </button>
            )}
            {resumen.lotesPorVencer > 0 && (
              <button
                type="button"
                onClick={() => setFiltroVencimiento("por_vencer")}
                className="rounded-lg border border-yellow-500/50 bg-yellow-500/15 px-3 py-1.5 text-xs font-semibold text-yellow-200 transition hover:bg-yellow-500/25 sm:text-sm"
              >
                Ver por vencer
              </button>
            )}
          </div>
        </div>
      )}

      {/* TABLA */}
      <div className="rounded-xl border border-[#2a2a2a] bg-[#1b1b1b] p-4 shadow-lg sm:p-6">
        <h2 className="mb-3 text-xl font-semibold text-gray-200 sm:text-2xl">
          Lista de Productos
        </h2>
        <p className="mb-3 text-xs text-gray-500 sm:hidden">
          Desliza la tabla hacia los lados para ver todas las columnas.
        </p>

        <div
          className="mb-4 flex flex-wrap gap-2"
          role="group"
          aria-label="Filtrar por vencimiento"
        >
          {filtrosVencimiento.map((filtro) => {
            const activo = filtroVencimiento === filtro.id;

            return (
              <button
                key={filtro.id}
                type="button"
                aria-pressed={activo}
                onClick={() => setFiltroVencimiento(filtro.id)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition sm:text-sm ${
                  activo
                    ? "border-orange-500 bg-orange-500 text-black"
                    : "border-[#3a3a3a] bg-[#111] text-gray-300 hover:border-orange-500/60 hover:text-orange-300"
                }`}
              >
                {filtro.texto} ({filtro.cantidad})
              </button>
            );
          })}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-sm sm:text-base">
            <thead>
              <tr className="text-gray-400 border-b border-[#333] text-left">
                <th className="whitespace-nowrap p-3 cursor-pointer" onClick={() => ordenarPor("category")}>
                  Rubro {orden === "category" && (direccion === "asc" ? "▲" : "▼")}
                </th>

                <th className="whitespace-nowrap p-3 cursor-pointer" onClick={() => ordenarPor("product_name")}>
                  Producto {orden === "product_name" && (direccion === "asc" ? "▲" : "▼")}
                </th>

                <th className="whitespace-nowrap p-3 cursor-pointer" onClick={() => ordenarPor("brand")}>
                  Marca {orden === "brand" && (direccion === "asc" ? "▲" : "▼")}
                </th>

                <th className="whitespace-nowrap p-3">Variedad</th>

                <th className="whitespace-nowrap p-3">Contenido</th>

                <th className="whitespace-nowrap p-3 cursor-pointer" onClick={() => ordenarPor("total_quantity")}>
                  Cantidad {orden === "total_quantity" && (direccion === "asc" ? "▲" : "▼")}
                </th>

                <th className="whitespace-nowrap p-3 cursor-pointer" onClick={() => ordenarPor("price")}>
                  Precio {orden === "price" && (direccion === "asc" ? "▲" : "▼")}
                </th>

                <th className="whitespace-nowrap p-3 cursor-pointer" onClick={() => ordenarPor("fecha_ingreso")}>
                  Ingreso {orden === "fecha_ingreso" && (direccion === "asc" ? "▲" : "▼")}
                </th>

                <th className="whitespace-nowrap p-3 cursor-pointer" onClick={() => ordenarPor("fecha_caducidad")}>
                  Vencimiento {orden === "fecha_caducidad" && (direccion === "asc" ? "▲" : "▼")}
                </th>

                {puedeGestionar && (
                  <th className="whitespace-nowrap p-3 text-right">Acciones</th>
                )}

              </tr>
            </thead>

            <tbody>
              {variantesOrdenadas.length === 0 && (
                <tr>
                  <td
                    colSpan={puedeGestionar ? 10 : 9}
                    className="p-6 text-center text-gray-500"
                  >
                    No hay productos que coincidan con la búsqueda o el filtro.
                  </td>
                </tr>
              )}

              {variantesOrdenadas.map((v) => {
                const ingreso = fechaIngreso(v.batches);
                const vencimiento = fechaVencimiento(v.batches);
                const loteVencimiento = loteDelVencimiento(v);
                const estado = estadoVencimiento(vencimiento);

                return (
                  <tr
                    key={v.variant_id}
                    className="border-b border-[#2a2a2a] hover:bg-[#2a2a2a]/40 transition group"
                  >
                    <td className="whitespace-nowrap p-3">
                      <span className="px-3 py-1 bg-orange-600/20 text-orange-400 rounded-full text-sm relative inline-block">

                        <span className="transition-opacity duration-200 group-hover:opacity-0">
                          {v.category}
                        </span>

                        {v.batches.length > 0 && (
                          <span
                            className="
                              absolute inset-0
                              flex items-center justify-center
                              opacity-0
                              group-hover:opacity-100
                              group-hover:translate-y-[-2px]
                              transition-all
                              duration-300
                              text-orange-300
                              font-semibold
                            "
                          >
                            {v.batches.length > 1
                              ? `Lotes: ${v.batches.length}`
                              : `Lote #${loteVencimiento?.id}`}
                          </span>
                        )}

                      </span>
                    </td>

                    <td className="whitespace-nowrap p-3 font-medium text-gray-200">{v.product_name}</td>

                    <td className="whitespace-nowrap p-3 text-gray-300">{v.brand}</td>

                    <td className="whitespace-nowrap p-3 text-gray-300">{v.type_variety}</td>

                    <td className="whitespace-nowrap p-3 text-gray-300">
                      {v.content_value ? `${v.content_value} ${v.content_unit}` : "Por definir"}
                    </td>

                    <td className="whitespace-nowrap p-3">{v.total_quantity}</td>

                    <td
                      className={`whitespace-nowrap p-3 ${
                        v.price === null ? "text-gray-500" : "text-gray-200"
                      }`}
                    >
                      {formatearPrecio(v.price)}
                    </td>

                    <td className="whitespace-nowrap p-3 text-gray-300">
                      {formatearFecha(ingreso)}
                    </td>

                    <td
                      title={lotesOrdenados(v)
                        .map(
                          (b) =>
                            `Lote #${b.id}: ${
                              b.expiration_date
                                ? formatearFecha(b.expiration_date)
                                : "sin fecha"
                            }`
                        )
                        .join("\n")}
                      className={`whitespace-nowrap p-3 font-semibold ${claseEstadoVencimiento(estado)}`}
                    >
                      <div>{formatearFecha(vencimiento)}</div>

                      {v.batches.length > 0 && (
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] font-normal">
                          <span className="text-gray-500">
                            {v.batches.length === 1
                              ? `Lote #${lotesOrdenados(v)[0].id}`
                              : `Lotes: ${lotesOrdenados(v)
                                  .map((b) => `#${b.id}`)
                                  .join(" · ")}`}
                          </span>

                          {(estado === "vencido" ||
                            estado === "por_vencer") && (
                            <span
                              className={`rounded-full border px-2 py-0.5 font-semibold ${badgeEstadoVencimiento(estado)}`}
                            >
                              {textoEstadoVencimiento(estado)}
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    {puedeGestionar && (
                      <td className="whitespace-nowrap p-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditando(v);
                              setFormEdit({
                                product_name: v.product_name,
                                category: v.category,
                                brand: v.brand,
                                type_variety: v.type_variety,
                                content_value: v.content_value,
                                content_unit: v.content_unit,
                                price: v.price ?? "",
                              });
                            }}
                            className="rounded p-1 text-blue-400 transition hover:bg-blue-500/10 hover:text-blue-300"
                            title="Editar producto"
                            aria-label={`Editar ${v.product_name}`}
                          >
                            <PencilSquareIcon className="h-6 w-6" />
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setErrorEliminar(null);
                              setPorEliminar(v);
                            }}
                            className="rounded p-1 text-red-500 transition hover:bg-red-500/10 hover:text-red-400"
                            title="Eliminar del inventario"
                            aria-label={`Eliminar ${v.product_name}`}
                          >
                            <TrashIcon className="h-6 w-6" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>

          </table>
        </div>
      </div>

      <EditarVariante
        variante={editando}
        form={formEdit}
        setForm={setFormEdit}
        onClose={() => setEditando(null)}
        onSave={guardarCambios}
      />

      {porEliminar && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="titulo-eliminar"
        >
          <div className="w-full max-w-md rounded-xl border border-[#3a3a3a] bg-[#1b1b1b] p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="shrink-0 rounded-full bg-red-500/15 p-2 text-red-400">
                <TrashIcon className="h-6 w-6" />
              </span>

              <div className="min-w-0">
                <h2
                  id="titulo-eliminar"
                  className="text-lg font-semibold text-gray-100"
                >
                  Eliminar del inventario
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-gray-400">
                  Se borrarán también sus lotes, fechas y cantidades. Esta
                  acción no se puede deshacer.
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-[#2a2a2a] bg-[#111] p-3 text-sm">
              <p className="font-semibold text-gray-100">
                {porEliminar.product_name}
              </p>
              <p className="mt-0.5 text-gray-300">
                {porEliminar.brand} ·{" "}
                {porEliminar.type_variety || "Sin variedad"} ·{" "}
                {porEliminar.content_value
                  ? `${porEliminar.content_value} ${porEliminar.content_unit}`
                  : "Por definir"}
              </p>
              <p className="mt-1 text-gray-500">
                {porEliminar.total_quantity} unidad(es) ·{" "}
                {porEliminar.batches.length} lote(s)
              </p>
            </div>

            {errorEliminar && (
              <p
                role="alert"
                className="mt-3 rounded bg-red-500/15 p-3 text-sm text-red-300"
              >
                {errorEliminar}
              </p>
            )}

            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                autoFocus
                onClick={() => {
                  setPorEliminar(null);
                  setErrorEliminar(null);
                }}
                disabled={eliminando}
                className="rounded-lg border border-[#3a3a3a] px-4 py-2 text-sm font-semibold text-gray-300 transition hover:bg-[#2a2a2a] disabled:opacity-60"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={eliminarProducto}
                disabled={eliminando}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
              >
                {eliminando ? "Eliminando..." : "Sí, eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
