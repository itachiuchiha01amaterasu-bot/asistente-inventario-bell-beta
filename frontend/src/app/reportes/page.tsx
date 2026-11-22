"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownTrayIcon,
  ChartBarIcon,
  CubeIcon,
  ExclamationTriangleIcon,
  DocumentChartBarIcon,
} from "@heroicons/react/24/outline";

import { useAuth } from "@/context/AuthContext";
import { API_URL } from "@/lib/api";
import {
  descargarCSV,
  filasInventario,
  filasResumenRubros,
  filasStockBajo,
  filasVencimientos,
  nombreReporte,
} from "@/lib/reportes";
import {
  resumirVencimientos,
  type VarianteVencimiento,
} from "@/lib/vencimientos";

type Producto = {
  id: number;
  name: string;
  category: string;
  variants: Omit<VarianteVencimiento, "product_name" | "category">[];
};

type TipoReporte = "inventario" | "vencimientos" | "stock_bajo" | "rubros";

export default function Reportes() {
  const { isAuthenticated, token } = useAuth();
  const router = useRouter();

  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, router]);

  useEffect(() => {
    if (!isAuthenticated || !token) return;

    let cancelado = false;

    fetch(`${API_URL}/api/inventario`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("No se pudo cargar el inventario");
        return res.json();
      })
      .then((data) => {
        if (!cancelado) setProductos(data.productos || []);
      })
      .catch(() => {
        if (!cancelado) {
          setError("No se pudo cargar el inventario para generar los reportes.");
        }
      })
      .finally(() => {
        if (!cancelado) setLoading(false);
      });

    return () => {
      cancelado = true;
    };
  }, [isAuthenticated, token]);

  const variantes = useMemo<VarianteVencimiento[]>(() => {
    return productos.flatMap((producto) =>
      producto.variants.map((variante) => ({
        ...variante,
        product_name: producto.name,
        category: producto.category,
      }))
    );
  }, [productos]);

  const resumen = useMemo(() => resumirVencimientos(variantes), [variantes]);

  const reportes = useMemo(
    () => ({
      inventario: filasInventario(variantes),
      vencimientos: filasVencimientos(variantes),
      stock_bajo: filasStockBajo(variantes),
      rubros: filasResumenRubros(variantes),
    }),
    [variantes]
  );

  const totalUnidades = variantes.reduce(
    (total, variante) => total + variante.total_quantity,
    0
  );

  const descargar = (tipo: TipoReporte) => {
    const configuracion: Record<
      TipoReporte,
      { nombre: string; filas: string[][] }
    > = {
      inventario: {
        nombre: nombreReporte("inventario"),
        filas: reportes.inventario,
      },
      vencimientos: {
        nombre: nombreReporte("vencimientos"),
        filas: reportes.vencimientos,
      },
      stock_bajo: {
        nombre: nombreReporte("stock_bajo"),
        filas: reportes.stock_bajo,
      },
      rubros: {
        nombre: nombreReporte("resumen_por_rubro"),
        filas: reportes.rubros,
      },
    };

    const { nombre, filas } = configuracion[tipo];
    descargarCSV(nombre, filas);
    setAviso(`Reporte descargado: ${nombre}`);
    window.setTimeout(() => setAviso(null), 4000);
  };

  if (!isAuthenticated) return null;

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse lg:space-y-10">
        <h1 className="text-2xl font-bold tracking-tight text-orange-400 sm:text-3xl lg:text-4xl">
          Reportes
        </h1>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="h-28 rounded-xl bg-[#1b1b1b]"></div>
          <div className="h-28 rounded-xl bg-[#1b1b1b]"></div>
          <div className="h-28 rounded-xl bg-[#1b1b1b]"></div>
          <div className="h-28 rounded-xl bg-[#1b1b1b]"></div>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="h-56 rounded-xl bg-[#1b1b1b]"></div>
          <div className="h-56 rounded-xl bg-[#1b1b1b]"></div>
          <div className="h-56 rounded-xl bg-[#1b1b1b]"></div>
          <div className="h-56 rounded-xl bg-[#1b1b1b]"></div>
        </div>
      </div>
    );
  }

  const tarjetas = [
    {
      tipo: "inventario" as const,
      titulo: "Inventario completo",
      descripcion:
        "Catálogo con rubro, producto, marca, variedad, contenido, precio, SKU, stock, lotes y vencimiento más próximo.",
      filas: reportes.inventario.length - 1,
      Icono: CubeIcon,
      color: "text-orange-400",
      fondo: "bg-orange-500/10",
      borde: "border-orange-500/30",
    },
    {
      tipo: "vencimientos" as const,
      titulo: "Vencimientos por lote",
      descripcion:
        "Todos los lotes ordenados por urgencia, con estado, días restantes, cantidad, precio, valor del lote, ingreso y vencimiento.",
      filas: reportes.vencimientos.length - 1,
      Icono: ExclamationTriangleIcon,
      color: "text-yellow-400",
      fondo: "bg-yellow-500/10",
      borde: "border-yellow-500/30",
    },
    {
      tipo: "stock_bajo" as const,
      titulo: "Stock bajo",
      descripcion:
        "Variantes con menos de 10 unidades, ordenadas de menor a mayor stock.",
      filas: reportes.stock_bajo.length - 1,
      Icono: ChartBarIcon,
      color: "text-red-400",
      fondo: "bg-red-500/10",
      borde: "border-red-500/30",
    },
    {
      tipo: "rubros" as const,
      titulo: "Resumen por rubro",
      descripcion:
        "Unidades, valor del stock, variantes, lotes vencidos, por vencer y sin fecha, agrupados por rubro.",
      filas: reportes.rubros.length - 1,
      Icono: DocumentChartBarIcon,
      color: "text-cyan-400",
      fondo: "bg-cyan-500/10",
      borde: "border-cyan-500/30",
    },
  ];

  return (
    <div className="space-y-6 lg:space-y-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-orange-400 sm:text-3xl lg:text-4xl">
          Reportes
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-gray-400 sm:text-base">
          Descarga la información del inventario en formato CSV. Los archivos
          se abren en Excel, usan UTF-8 y separador punto y coma.
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
            className="shrink-0 rounded px-2 py-0.5 text-green-200 transition hover:bg-green-500/20"
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
          <p className="text-sm text-gray-400">Total de unidades</p>
          <p className="mt-1 text-3xl font-bold text-orange-400">
            {totalUnidades}
          </p>
        </div>

        <div className="rounded-xl border border-[#2a2a2a] bg-[#1b1b1b] p-4 shadow-lg sm:p-5">
          <p className="text-sm text-gray-400">Variantes / SKU</p>
          <p className="mt-1 text-3xl font-bold text-orange-400">
            {variantes.length}
          </p>
        </div>

        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 shadow-lg sm:p-5">
          <p className="text-sm text-red-200/80">Lotes vencidos</p>
          <p className="mt-1 text-3xl font-bold text-red-400">
            {resumen.lotesVencidos}
          </p>
          <p className="mt-1 text-xs text-red-200/70">
            {resumen.unidadesVencidas} unidad(es)
          </p>
        </div>

        <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4 shadow-lg sm:p-5">
          <p className="text-sm text-yellow-200/80">Por vencer (30 días)</p>
          <p className="mt-1 text-3xl font-bold text-yellow-400">
            {resumen.lotesPorVencer}
          </p>
          <p className="mt-1 text-xs text-yellow-200/70">
            {resumen.unidadesPorVencer} unidad(es)
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {tarjetas.map((tarjeta) => {
          const Icono = tarjeta.Icono;

          return (
            <article
              key={tarjeta.tipo}
              className={`flex flex-col rounded-xl border bg-[#1b1b1b] p-4 shadow-lg sm:p-6 ${tarjeta.borde}`}
            >
              <div className="flex items-start gap-3">
                <span
                  className={`shrink-0 rounded-full p-2.5 ${tarjeta.fondo} ${tarjeta.color}`}
                >
                  <Icono className="h-6 w-6" />
                </span>

                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-gray-100">
                    {tarjeta.titulo}
                  </h2>
                  <p className="mt-1 text-sm leading-relaxed text-gray-400">
                    {tarjeta.descripcion}
                  </p>
                </div>
              </div>

              <div className="mt-auto flex flex-col gap-2 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-xs text-gray-500">
                  {tarjeta.filas} fila(s) para descargar
                </span>

                <button
                  type="button"
                  onClick={() => descargar(tarjeta.tipo)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-orange-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300"
                >
                  <ArrowDownTrayIcon className="h-5 w-5" />
                  Descargar CSV
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <p className="text-xs leading-relaxed text-gray-500">
        El reporte de vencimientos incluye todos los lotes: vencidos, por
        vencer, vigentes y sin fecha. El reporte de stock bajo usa el umbral de
        10 unidades, el mismo que el panel principal.
      </p>
    </div>
  );
}
