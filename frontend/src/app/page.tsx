"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useIsClient } from "@/hooks/useIsClient";
import { API_URL } from "@/lib/api";
import {
  badgeEstadoVencimiento,
  formatearFecha,
  obtenerAlertas,
  resumirVencimientos,
  textoDiasParaVencer,
} from "@/lib/vencimientos";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
} from "recharts";

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

export default function Home() {
  const { isAuthenticated, token } = useAuth();
  const router = useRouter();

  // Todos los hooks deben ejecutarse ANTES de cualquier return condicional
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [pantallaPequena, setPantallaPequena] = useState(false);
  const isClient = useIsClient();

  useEffect(() => {
    const consulta = window.matchMedia("(max-width: 639px)");
    const actualizar = () => setPantallaPequena(consulta.matches);
    actualizar();
    consulta.addEventListener("change", actualizar);
    return () => consulta.removeEventListener("change", actualizar);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, router]);

  useEffect(() => {
    if (!isAuthenticated || !token) return;
    fetch(`${API_URL}/api/inventario`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        setProductos(data.productos || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [token, isAuthenticated]);

  const variantes = useMemo(() => {
    return productos.flatMap((p) =>
      p.variants.map((v) => ({
        ...v,
        product_name: p.name,
        category: p.category,
      }))
    );
  }, [productos]);

  const totalInventario = variantes.reduce(
    (acc, v) => acc + v.total_quantity,
    0
  );

  const variantesRegistradas = variantes.length;

  const categoriasMap: Record<string, number> = {};
  variantes.forEach((v) => {
    const cat = v.category || "Sin categoría";
    categoriasMap[cat] = (categoriasMap[cat] || 0) + v.total_quantity;
  });

  const dataCategorias = Object.entries(categoriasMap).map(
    ([categoria, cantidad]) => ({
      categoria,
      cantidad,
    })
  );

  const colores = ["#f97316", "#fb923c", "#fdba74", "#fed7aa", "#ffedd5"];

  const stockLevels = {
    alto: variantes.filter((v) => v.total_quantity >= 20).length,
    medio: variantes.filter((v) => v.total_quantity >= 10 && v.total_quantity < 20).length,
    bajo: variantes.filter((v) => v.total_quantity < 10).length,
  };

  const dataStock = [
    { nivel: "Alto", cantidad: stockLevels.alto },
    { nivel: "Medio", cantidad: stockLevels.medio },
    { nivel: "Bajo", cantidad: stockLevels.bajo },
  ];

  const alertas = useMemo(() => obtenerAlertas(variantes), [variantes]);
  const resumen = useMemo(() => resumirVencimientos(variantes), [variantes]);
  const alertasVisibles = alertas.slice(0, 6);

  if (!isAuthenticated) return null;

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse lg:space-y-10">
        <h1 className="text-2xl font-bold tracking-tight text-orange-400 sm:text-3xl lg:text-4xl">
          Panel Principal
        </h1>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:gap-6">
          <div className="bg-[#1b1b1b] h-32 rounded-xl"></div>
          <div className="bg-[#1b1b1b] h-32 rounded-xl"></div>
          <div className="bg-[#1b1b1b] h-32 rounded-xl"></div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:gap-6">
          <div className="bg-[#1b1b1b] h-72 rounded-xl"></div>
          <div className="bg-[#1b1b1b] h-72 rounded-xl"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 lg:space-y-10">
      {/* Título */}
      <h1 className="text-2xl font-bold tracking-tight text-orange-400 animate-[fadeIn_.4s_ease-out] sm:text-3xl lg:text-4xl">
        Panel Principal
      </h1>

      {/* TARJETAS */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:gap-6">

        {/* Tarjeta 1 */}
        <div className="bg-gradient-to-br from-[#1b1b1b] to-[#141414] p-4 sm:p-6 rounded-xl shadow-lg border border-[#2a2a2a] sm:hover:scale-[1.03] transition-all animate-[fadeIn_.4s_ease-out]">
          <div className="flex items-center justify-between">
            <h3 className="text-sm text-gray-400 sm:text-base lg:text-lg">Total Inventario</h3>
            <span className="text-orange-500 text-2xl sm:text-3xl lg:text-4xl drop-shadow-[0_0_10px_rgba(249,115,22,0.4)]">📦</span>
          </div>
          <p className="mt-2 text-3xl font-bold text-orange-500 sm:text-4xl lg:text-5xl">{totalInventario}</p>
          <div className="h-[3px] w-full bg-orange-500/20 mt-4 rounded-full"></div>
        </div>

        {/* Tarjeta 2 */}
        <div className="bg-gradient-to-br from-[#1b1b1b] to-[#141414] p-4 sm:p-6 rounded-xl shadow-lg border border-[#2a2a2a] sm:hover:scale-[1.03] transition-all animate-[fadeIn_.5s_ease-out]">
          <div className="flex items-center justify-between">
            <h3 className="text-sm text-gray-400 sm:text-base lg:text-lg">Productos Registrados</h3>
            <span className="text-orange-500 text-2xl sm:text-3xl lg:text-4xl drop-shadow-[0_0_10px_rgba(249,115,22,0.4)]">📄</span>
          </div>
          <p className="mt-2 text-3xl font-bold text-orange-500 sm:text-4xl lg:text-5xl">{variantesRegistradas}</p>
          <div className="h-[3px] w-full bg-orange-500/20 mt-4 rounded-full"></div>
        </div>

        {/* Tarjeta 3 */}
        <div className="bg-gradient-to-br from-[#1b1b1b] to-[#141414] p-4 sm:p-6 rounded-xl shadow-lg border border-[#2a2a2a] sm:hover:scale-[1.03] transition-all animate-[fadeIn_.6s_ease-out]">
          <div className="flex items-center justify-between">
            <h3 className="text-sm text-gray-400 sm:text-base lg:text-lg">Alertas de vencimiento</h3>
            <span className="text-orange-500 text-2xl sm:text-3xl lg:text-4xl drop-shadow-[0_0_10px_rgba(249,115,22,0.4)]">⚠️</span>
          </div>
          <p
            className={`mt-2 text-3xl font-bold sm:text-4xl lg:text-5xl ${
              resumen.lotesVencidos > 0
                ? "text-red-400"
                : resumen.lotesPorVencer > 0
                  ? "text-yellow-400"
                  : "text-green-400"
            }`}
          >
            {resumen.lotesVencidos + resumen.lotesPorVencer}
          </p>
          <p className="mt-1 text-xs text-gray-500 sm:text-sm">
            {resumen.lotesVencidos} vencido(s) · {resumen.lotesPorVencer} por vencer
          </p>
          <div className="h-[3px] w-full bg-orange-500/20 mt-4 rounded-full"></div>
        </div>

      </div>

      {/* ALERTAS DE VENCIMIENTO */}
      <section className="rounded-xl border border-[#2a2a2a] bg-[#1b1b1b] p-4 shadow-lg sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-orange-300 sm:text-2xl">
              Alertas de vencimiento
            </h2>
            <p className="mt-1 text-sm text-gray-400">
              Lotes vencidos o que vencen en los próximos 30 días.
            </p>
          </div>
          <Link
            href="/inventario"
            className="shrink-0 text-sm font-semibold text-orange-400 hover:underline"
          >
            Ir al inventario →
          </Link>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div
            className={`rounded-lg border p-4 ${
              resumen.lotesVencidos > 0
                ? "border-red-500/40 bg-red-500/10"
                : "border-[#2a2a2a] bg-[#111]"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-gray-400">Lotes vencidos</p>
              {resumen.lotesVencidos > 0 && (
                <Link
                  href="/inventario?alerta=vencidos"
                  className="text-xs font-semibold text-red-300 hover:underline"
                >
                  Ver vencidos →
                </Link>
              )}
            </div>
            <p
              className={`mt-1 text-3xl font-bold ${
                resumen.lotesVencidos > 0 ? "text-red-400" : "text-gray-300"
              }`}
            >
              {resumen.lotesVencidos}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {resumen.unidadesVencidas} unidad(es)
            </p>
          </div>

          <div
            className={`rounded-lg border p-4 ${
              resumen.lotesPorVencer > 0
                ? "border-yellow-500/40 bg-yellow-500/10"
                : "border-[#2a2a2a] bg-[#111]"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-gray-400">Por vencer (30 días)</p>
              {resumen.lotesPorVencer > 0 && (
                <Link
                  href="/inventario?alerta=por_vencer"
                  className="text-xs font-semibold text-yellow-300 hover:underline"
                >
                  Ver por vencer →
                </Link>
              )}
            </div>
            <p
              className={`mt-1 text-3xl font-bold ${
                resumen.lotesPorVencer > 0 ? "text-yellow-400" : "text-gray-300"
              }`}
            >
              {resumen.lotesPorVencer}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {resumen.unidadesPorVencer} unidad(es)
            </p>
          </div>
        </div>

        {alertasVisibles.length === 0 ? (
          <p className="mt-4 rounded-lg border border-green-500/30 bg-green-500/10 p-4 text-sm text-green-200">
            🎉 No hay lotes vencidos ni por vencer en los próximos 30 días.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-[#2a2a2a] overflow-hidden rounded-lg border border-[#2a2a2a] bg-[#111]">
            {alertasVisibles.map((alerta) => (
              <li
                key={`${alerta.variant_id}-${alerta.lote_id}`}
                className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-gray-100">
                    {alerta.product_name} · {alerta.brand}
                  </p>
                  <p className="mt-0.5 text-sm text-gray-400">
                    Lote #{alerta.lote_id} · {alerta.quantity} unidad(es) ·
                    vence {formatearFecha(alerta.expiration_date)}
                  </p>
                </div>
                <span
                  className={`shrink-0 self-start rounded-full border px-3 py-1 text-xs font-semibold sm:self-auto ${badgeEstadoVencimiento(alerta.estado)}`}
                >
                  {textoDiasParaVencer(alerta.expiration_date)}
                </span>
              </li>
            ))}
          </ul>
        )}

        {alertas.length > alertasVisibles.length && (
          <div className="mt-3 text-right">
            <Link
              href="/inventario?alerta=alertas"
              className="text-sm font-semibold text-orange-400 hover:underline"
            >
              Ver las {alertas.length} alertas →
            </Link>
          </div>
        )}
      </section>

      {/* GRÁFICOS */}
      <h2 className="text-xl font-semibold text-orange-300 drop-shadow-[0_0_8px_rgba(249,115,22,0.3)] sm:text-2xl lg:text-3xl">
        Gráficos
      </h2>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:gap-6">

        {/* Gráfico 1 */}
        <div className="min-w-0 overflow-hidden rounded-xl border border-[#2a2a2a] bg-[#1b1b1b] p-4 shadow-lg animate-[fadeIn_.5s_ease-out] sm:p-6">
          <h3 className="mb-4 text-lg font-semibold text-gray-300 sm:text-xl">
            Inventario por Rubro
          </h3>

          <div className="relative h-[260px] w-full sm:h-[300px]">
            {isClient && (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={dataCategorias}
                    dataKey="cantidad"
                    nameKey="categoria"
                    cx="50%"
                    cy="50%"
                    outerRadius={pantallaPequena ? 70 : 90}
                    isAnimationActive={true}
                    animationDuration={800}
                    label={
                      pantallaPequena
                        ? false
                        : ({ name, percent }) =>
                            `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                    }
                  >
                    {dataCategorias.map((_, index) => (
                      <Cell key={index} fill={colores[index % colores.length]} />
                    ))}
                  </Pie>

                  <Tooltip
                    contentStyle={{
                      background: "#1b1b1b",
                      border: "1px solid #333",
                      borderRadius: "10px",
                      color: "#fff",
                    }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Gráfico 2 */}
        <div className="min-w-0 overflow-hidden rounded-xl border border-[#2a2a2a] bg-[#1b1b1b] p-4 shadow-lg animate-[fadeIn_.6s_ease-out] sm:p-6">
          <h3 className="mb-4 text-lg font-semibold text-gray-300 sm:text-xl">
            Niveles de Stock
          </h3>

          <div className="relative h-[260px] w-full sm:h-[300px]">
            {isClient && (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dataStock}>
                  <XAxis dataKey="nivel" stroke="#aaa" />
                  <YAxis stroke="#aaa" />

                  <Tooltip
                    contentStyle={{
                      background: "#1b1b1b",
                      border: "1px solid #333",
                      borderRadius: "10px",
                      color: "#fff",
                    }}
                    labelStyle={{ color: "#f97316" }}
                    itemStyle={{ color: "#f97316" }}
                    formatter={(value) => [`${value} variantes`, "Cantidad"]}
                  />

                  <Bar
                    dataKey="cantidad"
                    radius={[10, 10, 0, 0]}
                    animationDuration={800}
                  >
                    {dataStock.map((entry, index) => {
                      const colores: Record<"Alto" | "Medio" | "Bajo", string> = {
                        Alto: "#22c55e",
                        Medio: "#eab308",
                        Bajo: "#ef4444",
                      };
                      const nivel = entry.nivel as keyof typeof colores;
                      return <Cell key={index} fill={colores[nivel]} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
