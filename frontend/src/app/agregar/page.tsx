"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import { useAuth } from "@/context/AuthContext";
import { API_URL } from "@/lib/api";

type Catalogos = {
  categorias: string[];
  marcas: string[];
};

type Creado = {
  mensaje: string;
  producto: { id: number; name: string; category: string };
  variante: {
    variant_id: number;
    brand: string;
    type_variety: string | null;
    content_value: number | null;
    content_unit: string | null;
    sku_code: string | null;
    total_quantity: number;
  };
};

const UNIDADES = ["Unidad", "L", "kg", "g", "ml"];

// Fecha de hoy en horario local (evita el desfase de toISOString en UTC).
const hoyLocal = () => {
  const ahora = new Date();
  const ajustada = new Date(ahora.getTime() - ahora.getTimezoneOffset() * 60000);
  return ajustada.toISOString().slice(0, 10);
};

const formInicial = () => ({
  product_name: "",
  category: "",
  brand: "",
  type_variety: "",
  content_value: "",
  content_unit: "",
  quantity: "1",
  arrival_date: hoyLocal(),
  expiration_date: "",
});

export default function AgregarProductoPage() {
  const { user, token, isAuthenticated, isReady } = useAuth();
  const router = useRouter();

  const [form, setForm] = useState(formInicial);
  const [catalogos, setCatalogos] = useState<Catalogos>({
    categorias: [],
    marcas: [],
  });
  const [error, setError] = useState("");
  const [creado, setCreado] = useState<Creado | null>(null);
  const [enviando, setEnviando] = useState(false);

  const esAdmin = user?.role === "admin" || user?.role === "super_admin";

  useEffect(() => {
    if (isReady && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isReady, isAuthenticated, router]);

  // Categorías y marcas existentes para sugerir mientras se escribe.
  useEffect(() => {
    if (!isReady || !esAdmin || !token) return;

    fetch(`${API_URL}/api/catalogos`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setCatalogos({
            categorias: data.categorias || [],
            marcas: data.marcas || [],
          });
        }
      })
      .catch(() => {
        // Si falla, el formulario sigue sirviendo: son solo sugerencias.
      });
  }, [isReady, esAdmin, token]);

  const cambiar = (
    campo: keyof ReturnType<typeof formInicial>,
    valor: string
  ) => {
    setForm((previo) => ({ ...previo, [campo]: valor }));
    setError("");
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!form.product_name.trim()) {
      setError("Escribe el nombre del producto");
      return;
    }

    if (form.content_value.trim() && !form.content_unit) {
      setError("Elige la unidad del contenido");
      return;
    }

    setEnviando(true);

    try {
      const res = await fetch(`${API_URL}/api/productos`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          product_name: form.product_name,
          category: form.category,
          brand: form.brand,
          type_variety: form.type_variety,
          content_value: form.content_value,
          content_unit: form.content_unit,
          quantity: form.quantity,
          arrival_date: form.arrival_date,
          expiration_date: form.expiration_date,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 401) {
        router.replace("/login");
        return;
      }

      if (!res.ok) {
        setError(data.error || "No se pudo agregar el producto");
        return;
      }

      setCreado(data);
      setForm(formInicial());
    } catch {
      setError("No se pudo conectar con el servidor. Intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  };

  const inputClass =
    "w-full rounded border border-gray-600 bg-gray-700 px-3 py-2.5 text-base text-white focus:border-orange-500 focus:outline-none";
  const labelClass = "mb-1 block text-sm font-medium text-gray-300";

  if (!isReady || !isAuthenticated) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-sm text-gray-400">Cargando...</p>
      </div>
    );
  }

  if (!esAdmin) {
    return (
      <div className="mx-auto w-full max-w-md rounded-lg bg-gray-800 p-6 text-center shadow-xl">
        <ExclamationTriangleIcon className="mx-auto mb-3 h-10 w-10 text-yellow-400" />
        <h1 className="mb-2 text-lg font-bold text-orange-500">
          Acceso restringido
        </h1>
        <p className="mb-5 text-sm text-gray-400">
          Solo los administradores pueden agregar productos al inventario.
        </p>
        <Link
          href="/inventario"
          className="inline-block rounded bg-orange-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-orange-600"
        >
          Ver inventario
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-4 sm:mb-6">
        <h1 className="text-xl font-bold text-orange-500 sm:text-2xl">
          Agregar Producto
        </h1>
        <p className="mt-1 text-sm text-gray-400">
          Registra un producto y su primera cantidad en el inventario.
        </p>
      </div>

      {creado && (
        <div className="mb-4 rounded-lg border border-green-500/40 bg-green-500/10 p-4">
          <div className="flex items-start gap-3">
            <CheckCircleIcon className="mt-0.5 h-6 w-6 shrink-0 text-green-400" />
            <div className="min-w-0">
              <p className="font-semibold text-green-300">
                {creado.mensaje}
              </p>
              <p className="mt-1 break-words text-sm text-green-200/90">
                {creado.producto.name} · {creado.variante.brand} ·{" "}
                {creado.variante.total_quantity} unidad(es)
              </p>
              <p className="mt-1 break-all text-xs text-green-200/70">
                SKU: {creado.variante.sku_code || "sin SKU"}
              </p>

              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Link
                  href="/inventario"
                  className="rounded bg-green-600 px-4 py-2 text-center text-sm font-semibold text-white transition hover:bg-green-700"
                >
                  Ver inventario
                </Link>
                <button
                  type="button"
                  onClick={() => setCreado(null)}
                  className="rounded border border-green-500/40 px-4 py-2 text-sm font-semibold text-green-200 transition hover:bg-green-500/10"
                >
                  Agregar otro
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded bg-red-500/20 p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <form
        onSubmit={guardar}
        className="rounded-lg bg-gray-800 p-4 shadow-xl sm:p-6"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="product_name" className={labelClass}>
              Producto <span className="text-orange-400">*</span>
            </label>
            <input
              id="product_name"
              type="text"
              required
              autoComplete="off"
              placeholder="Ej: Aceite de girasol"
              className={inputClass}
              value={form.product_name}
              onChange={(e) => cambiar("product_name", e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="category" className={labelClass}>
              Categoría
            </label>
            <input
              id="category"
              type="text"
              list="lista-categorias"
              autoComplete="off"
              placeholder="Ej: Aceites"
              className={inputClass}
              value={form.category}
              onChange={(e) => cambiar("category", e.target.value)}
            />
            <datalist id="lista-categorias">
              {catalogos.categorias.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <p className="mt-1 text-xs text-gray-400">
              Si no existe, se crea (por defecto: General).
            </p>
          </div>

          <div>
            <label htmlFor="brand" className={labelClass}>
              Marca
            </label>
            <input
              id="brand"
              type="text"
              list="lista-marcas"
              autoComplete="off"
              placeholder="Ej: Bell"
              className={inputClass}
              value={form.brand}
              onChange={(e) => cambiar("brand", e.target.value)}
            />
            <datalist id="lista-marcas">
              {catalogos.marcas.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
            <p className="mt-1 text-xs text-gray-400">
              Si no existe, se crea (por defecto: Sin marca).
            </p>
          </div>

          <div>
            <label htmlFor="type_variety" className={labelClass}>
              Variedad / tipo
            </label>
            <input
              id="type_variety"
              type="text"
              autoComplete="off"
              placeholder="Ej: Oliva, Integral, Fino"
              className={inputClass}
              value={form.type_variety}
              onChange={(e) => cambiar("type_variety", e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="content_value" className={labelClass}>
              Contenido
            </label>
            <div className="flex gap-2">
              <input
                id="content_value"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder="Ej: 1"
                className={inputClass}
                value={form.content_value}
                onChange={(e) => cambiar("content_value", e.target.value)}
              />
              <select
                id="content_unit"
                aria-label="Unidad del contenido"
                className={`${inputClass} max-w-[9rem]`}
                value={form.content_unit}
                onChange={(e) => cambiar("content_unit", e.target.value)}
              >
                <option value="">Unidad</option>
                {UNIDADES.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
            <p className="mt-1 text-xs text-gray-400">
              Opcional. Ej: 1 L, 500 g, 750 ml.
            </p>
          </div>

          <div>
            <label htmlFor="quantity" className={labelClass}>
              Cantidad <span className="text-orange-400">*</span>
            </label>
            <input
              id="quantity"
              type="number"
              required
              min="0"
              step="1"
              inputMode="numeric"
              className={inputClass}
              value={form.quantity}
              onChange={(e) => cambiar("quantity", e.target.value)}
            />
            <p className="mt-1 text-xs text-gray-400">
              Unidades que ingresan con este lote.
            </p>
          </div>

          <div>
            <label htmlFor="arrival_date" className={labelClass}>
              Fecha de ingreso
            </label>
            <input
              id="arrival_date"
              type="date"
              className={inputClass}
              value={form.arrival_date}
              onChange={(e) => cambiar("arrival_date", e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="expiration_date" className={labelClass}>
              Fecha de caducidad
            </label>
            <input
              id="expiration_date"
              type="date"
              className={inputClass}
              value={form.expiration_date}
              onChange={(e) => cambiar("expiration_date", e.target.value)}
            />
            <p className="mt-1 text-xs text-gray-400">Opcional.</p>
          </div>

          <div className="sm:col-span-2">
            <p className="rounded border border-[#333] bg-[#111] p-3 text-xs leading-relaxed text-gray-400">
              Si el producto, la marca, la variedad y el contenido ya existen,
              la cantidad se sumará al stock actual en lugar de duplicarlo.
            </p>
          </div>

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={enviando}
              className="flex w-full items-center justify-center gap-2 rounded bg-orange-500 py-3 text-base font-bold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <PlusIcon className="h-5 w-5" />
              {enviando ? "Guardando..." : "Agregar al inventario"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
