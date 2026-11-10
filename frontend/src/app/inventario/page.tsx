"use client";

import { useEffect, useState, useMemo } from "react";
import EditarVariante from "../../components/EditarInv";
import { PencilSquareIcon } from "@heroicons/react/24/solid";
import { useAuth } from "@/context/AuthContext";
import { API_URL } from "@/lib/api";

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

const formatearFecha = (fecha: string | null) => {
  if (!fecha) return "Por definir";

  if (/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    const [y, m, d] = fecha.split("-");
    return `${d}/${m}/${y}`;
  }

  return "Por definir";
};

const estadoCaducidad = (fecha: string | null) => {
  if (!fecha) return "text-gray-300";

  const hoy = new Date();
  const cad = new Date(fecha);

  if (isNaN(cad.getTime())) return "text-gray-300";

  const diff = cad.getTime() - hoy.getTime();
  const dias = Math.ceil(diff / (1000 * 60 * 60 * 24));

  if (dias < 0) return "text-red-400";
  if (dias <= 30) return "text-yellow-400";
  return "text-green-400";
};

export default function Inventario() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [orden, setOrden] = useState<string | null>(null);
  const [direccion, setDireccion] = useState<"asc" | "desc">("asc");
  const [loading, setLoading] = useState(true);

  const [editando, setEditando] = useState<Variante | null>(null);
  const [formEdit, setFormEdit] = useState<any>({});
  const { token } = useAuth();

  useEffect(() => {
    fetch(`${API_URL}/api/inventario`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        setProductos(data.productos || []);
        setLoading(false);
      })
      .catch(() => {
        setProductos([]);
        setLoading(false);
      });
  }, [token]);

  const variantes = useMemo(() => {
    return productos.flatMap((p) =>
      p.variants.map((v) => ({
        ...v,
        product_name: p.name,
        category: p.category,
      }))
    );
  }, [productos]);

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
    return variantes.filter((v) => {
      const lote = v.batches[0] || null;

      const texto = `
        ${v.category}
        ${v.product_name}
        ${v.brand}
        ${v.type_variety}
        ${v.content_value} ${v.content_unit}
        ${lote?.arrival_date ?? ""}
        ${lote?.expiration_date ?? ""}
      `.toLowerCase();

      return texto.includes(busqueda.toLowerCase());
    });
  }, [variantes, busqueda]);

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
        const fechaA = new Date(a.batches[0]?.arrival_date || "9999-12-31").getTime();
        const fechaB = new Date(b.batches[0]?.arrival_date || "9999-12-31").getTime();
        return direccion === "asc" ? fechaA - fechaB : fechaB - fechaA;
      }

      if (orden === "fecha_caducidad") {
        const fechaA = new Date(a.batches[0]?.expiration_date || "9999-12-31").getTime();
        const fechaB = new Date(b.batches[0]?.expiration_date || "9999-12-31").getTime();
        return direccion === "asc" ? fechaA - fechaB : fechaB - fechaA;
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

      {/* TABLA */}
      <div className="rounded-xl border border-[#2a2a2a] bg-[#1b1b1b] p-4 shadow-lg sm:p-6">
        <h2 className="mb-1 text-xl font-semibold text-gray-200 sm:mb-6 sm:text-2xl">
          Lista de Productos
        </h2>
        <p className="mb-3 text-xs text-gray-500 sm:hidden">
          Desliza la tabla hacia los lados para ver todas las columnas.
        </p>

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

                <th className="whitespace-nowrap p-3 cursor-pointer" onClick={() => ordenarPor("fecha_ingreso")}>
                  Ingreso {orden === "fecha_ingreso" && (direccion === "asc" ? "▲" : "▼")}
                </th>

                <th className="whitespace-nowrap p-3 cursor-pointer" onClick={() => ordenarPor("fecha_caducidad")}>
                  Vencimiento {orden === "fecha_caducidad" && (direccion === "asc" ? "▲" : "▼")}
                </th>

              </tr>
            </thead>

            <tbody>
              {variantesOrdenadas.map((v) => {
                const lote = v.batches[0] || null;

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
                            Lote: #{v.batches[0].id}
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

                    <td className="whitespace-nowrap p-3 text-gray-300">
                      {formatearFecha(lote?.arrival_date || null)}
                    </td>

                    <td className={`whitespace-nowrap p-3 font-semibold ${estadoCaducidad(lote?.expiration_date || null)}`}>
                      {formatearFecha(lote?.expiration_date || null)}
                    </td>

                    <td className="whitespace-nowrap p-3">
                      <button
                        onClick={() => {
                          setEditando(v);
                          setFormEdit({
                            product_name: v.product_name,
                            category: v.category,
                            brand: v.brand,
                            type_variety: v.type_variety,
                            content_value: v.content_value,
                            content_unit: v.content_unit,
                          });
                        }}
                        className="text-blue-400 hover:text-blue-300 transition"
                      >
                        <PencilSquareIcon className="h-6 w-6" />
                      </button>
                    </td>
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
    </div>
  );
}
