import { parseFechaLocal, type LoteVencimiento } from "./vencimientos";
import { precioCSV } from "./precios";

export type CompraItem = {
  variant_id: number | null;
  product_name: string;
  brand: string | null;
  type_variety: string | null;
  content_value: number | null;
  content_unit: string | null;
  quantity: number;
  unit_price: number | null;
  subtotal: number | null;
};

export type Compra = {
  id: number;
  user_id: number | null;
  username: string;
  created_at: string | null;
  total_units: number;
  total: number;
  items: CompraItem[];
};

// Stock que realmente se puede vender: los lotes vencidos quedan afuera.
export function stockVendible(
  batches: LoteVencimiento[],
  hoy: Date = new Date()
): number {
  const base = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

  return batches.reduce((total, lote) => {
    if (!lote.expiration_date) return total + lote.quantity;

    const fecha = parseFechaLocal(lote.expiration_date);
    if (!fecha || fecha.getTime() < base.getTime()) return total;

    return total + lote.quantity;
  }, 0);
}

export function descripcionItem(item: CompraItem): string {
  const partes = [
    item.brand,
    item.type_variety,
    item.content_value !== null && item.content_unit
      ? `${item.content_value} ${item.content_unit}`
      : null,
  ].filter(Boolean);

  return partes.length > 0 ? partes.join(" · ") : "Sin detalle";
}

// Total de una compra. Las ventas registradas antes de que existiera el
// precio no tienen valor guardado: se muestran como "Sin precio" en lugar
// de un "$ 0,00" que daría a entender que se vendieron gratis.
export function totalCompra(compra: Compra): number | null {
  if (compra.total > 0) return compra.total;

  return compra.items.some((item) => item.unit_price !== null)
    ? compra.total
    : null;
}

export function formatearFechaHora(fecha: string | null): string {
  if (!fecha) return "Sin fecha";

  // La base guarda la fecha en UTC sin zona horaria: se agrega "Z" para
  // mostrarla en la hora local del navegador.
  const conZona = /[zZ]|[+-]\d{2}:?\d{2}$/.test(fecha) ? fecha : `${fecha}Z`;
  const fechaLocal = new Date(conZona);

  if (isNaN(fechaLocal.getTime())) return fecha;

  return fechaLocal.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Filas para el CSV de ventas (una fila por producto vendido).
export function filasVentas(compras: Compra[]): string[][] {
  const filas: string[][] = [
    [
      "Compra",
      "Fecha",
      "Usuario",
      "Producto",
      "Marca",
      "Variedad",
      "Contenido",
      "Cantidad",
      "Precio unitario",
      "Subtotal",
    ],
  ];

  for (const compra of compras) {
    for (const item of compra.items) {
      filas.push([
        String(compra.id),
        formatearFechaHora(compra.created_at),
        compra.username,
        item.product_name,
        item.brand || "",
        item.type_variety || "Sin variedad",
        item.content_value !== null && item.content_unit
          ? `${item.content_value} ${item.content_unit}`
          : "Por definir",
        String(item.quantity),
        precioCSV(item.unit_price),
        precioCSV(item.subtotal),
      ]);
    }
  }

  return filas;
}
