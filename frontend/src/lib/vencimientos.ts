// Utilidades compartidas para vencimientos.
// El backend entrega las fechas como "YYYY-MM-DD"; aquí se comparan en hora
// local para que "vence hoy" no se adelante ni se atrase por la zona horaria.

export const UMBRAL_POR_VENCER = 30;

export type EstadoVencimiento =
  | "vencido"
  | "por_vencer"
  | "vigente"
  | "sin_fecha";

export type LoteVencimiento = {
  id: number;
  quantity: number;
  arrival_date: string;
  expiration_date: string | null;
};

export type VarianteVencimiento = {
  variant_id: number;
  brand: string;
  type_variety: string;
  content_value: number | null;
  content_unit: string | null;
  sku_code?: string | null;
  price?: number | null;
  total_quantity: number;
  batches: LoteVencimiento[];
  product_name: string;
  category: string;
};

export type AlertaVencimiento = {
  variant_id: number;
  lote_id: number;
  product_name: string;
  brand: string;
  type_variety: string;
  content_value: number | null;
  content_unit: string | null;
  quantity: number;
  expiration_date: string;
  dias: number;
  estado: "vencido" | "por_vencer";
};

export type ResumenVencimientos = {
  lotesVencidos: number;
  lotesPorVencer: number;
  unidadesVencidas: number;
  unidadesPorVencer: number;
  variantesVencidas: number;
  variantesPorVencer: number;
  variantesConAlerta: number;
  variantesSinFecha: number;
  totalVariantes: number;
};

export type FiltroVencimiento =
  | "todos"
  | "alertas"
  | "vencidos"
  | "por_vencer"
  | "sin_fecha";

export function parseFechaLocal(fecha: string | null): Date | null {
  if (!fecha) return null;

  const coincidencia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  if (!coincidencia) return null;

  const fechaLocal = new Date(
    Number(coincidencia[1]),
    Number(coincidencia[2]) - 1,
    Number(coincidencia[3])
  );

  return isNaN(fechaLocal.getTime()) ? null : fechaLocal;
}

export function formatearFecha(fecha: string | null): string {
  const fechaLocal = parseFechaLocal(fecha);
  if (!fechaLocal) return "Por definir";

  return fechaLocal.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function diasHastaVencimiento(
  fecha: string | null,
  hoy: Date = new Date()
): number | null {
  const fechaLocal = parseFechaLocal(fecha);
  if (!fechaLocal) return null;

  const base = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return Math.round(
    (fechaLocal.getTime() - base.getTime()) / (1000 * 60 * 60 * 24)
  );
}

export function estadoVencimiento(
  fecha: string | null,
  umbral: number = UMBRAL_POR_VENCER
): EstadoVencimiento {
  const dias = diasHastaVencimiento(fecha);

  if (dias === null) return "sin_fecha";
  if (dias < 0) return "vencido";
  if (dias <= umbral) return "por_vencer";
  return "vigente";
}

export function textoEstadoVencimiento(estado: EstadoVencimiento): string {
  switch (estado) {
    case "vencido":
      return "Vencido";
    case "por_vencer":
      return "Por vencer";
    case "vigente":
      return "Vigente";
    default:
      return "Sin fecha";
  }
}

export function claseEstadoVencimiento(estado: EstadoVencimiento): string {
  switch (estado) {
    case "vencido":
      return "text-red-400";
    case "por_vencer":
      return "text-yellow-400";
    case "vigente":
      return "text-green-400";
    default:
      return "text-gray-300";
  }
}

export function badgeEstadoVencimiento(estado: EstadoVencimiento): string {
  switch (estado) {
    case "vencido":
      return "border-red-500/40 bg-red-500/15 text-red-300";
    case "por_vencer":
      return "border-yellow-500/40 bg-yellow-500/15 text-yellow-300";
    case "vigente":
      return "border-green-500/40 bg-green-500/15 text-green-300";
    default:
      return "border-[#2a2a2a] bg-[#111] text-gray-300";
  }
}

export function textoDiasParaVencer(
  fecha: string | null,
  umbral: number = UMBRAL_POR_VENCER
): string {
  const dias = diasHastaVencimiento(fecha);

  if (dias === null) return "Sin fecha";
  if (dias < 0) {
    const abs = Math.abs(dias);
    return `Vencido hace ${abs} día${abs === 1 ? "" : "s"}`;
  }
  if (dias === 0) return "Vence hoy";
  if (dias === 1) return "Vence mañana";
  if (dias <= umbral) return `Vence en ${dias} días`;
  return `Vigente (${dias} días)`;
}

// La columna "Vencimiento" muestra la fecha más próxima de todos los lotes.
export function fechaVencimiento(batches: LoteVencimiento[]): string | null {
  const fechas = batches
    .map((b) => b.expiration_date)
    .filter((f): f is string => Boolean(f))
    .sort();

  return fechas[0] ?? null;
}

// Ingreso más reciente (el último lote que entró).
export function fechaIngreso(batches: LoteVencimiento[]): string | null {
  const fechas = batches
    .map((b) => b.arrival_date)
    .filter(Boolean)
    .sort();

  return fechas[fechas.length - 1] ?? null;
}

export function loteDelVencimiento(
  variante: VarianteVencimiento
): LoteVencimiento | null {
  const fecha = fechaVencimiento(variante.batches);
  if (!fecha) return variante.batches[0] ?? null;
  return (
    variante.batches.find((b) => b.expiration_date === fecha) ?? null
  );
}

// Los lotes se muestran siempre por número, el asignado al crearlos.
export function lotesOrdenados(
  variante: VarianteVencimiento
): LoteVencimiento[] {
  return [...variante.batches].sort((a, b) => a.id - b.id);
}

export function obtenerAlertas(
  variantes: VarianteVencimiento[],
  umbral: number = UMBRAL_POR_VENCER
): AlertaVencimiento[] {
  const alertas: AlertaVencimiento[] = [];

  for (const variante of variantes) {
    for (const lote of variante.batches) {
      const estado = estadoVencimiento(lote.expiration_date, umbral);
      if (estado !== "vencido" && estado !== "por_vencer") continue;

      alertas.push({
        variant_id: variante.variant_id,
        lote_id: lote.id,
        product_name: variante.product_name,
        brand: variante.brand,
        type_variety: variante.type_variety,
        content_value: variante.content_value,
        content_unit: variante.content_unit,
        quantity: lote.quantity,
        expiration_date: lote.expiration_date as string,
        dias: diasHastaVencimiento(lote.expiration_date) ?? 0,
        estado,
      });
    }
  }

  // Primero lo más urgente: vencidos y luego los que vencen antes.
  return alertas.sort((a, b) => a.dias - b.dias);
}

export function resumirVencimientos(
  variantes: VarianteVencimiento[],
  umbral: number = UMBRAL_POR_VENCER
): ResumenVencimientos {
  const vencidas = new Set<number>();
  const porVencer = new Set<number>();
  let variantesSinFecha = 0;

  let lotesVencidos = 0;
  let lotesPorVencer = 0;
  let unidadesVencidas = 0;
  let unidadesPorVencer = 0;

  for (const variante of variantes) {
    if (fechaVencimiento(variante.batches) === null) {
      variantesSinFecha += 1;
    }

    for (const lote of variante.batches) {
      const estado = estadoVencimiento(lote.expiration_date, umbral);

      if (estado === "vencido") {
        lotesVencidos += 1;
        unidadesVencidas += lote.quantity;
        vencidas.add(variante.variant_id);
      } else if (estado === "por_vencer") {
        lotesPorVencer += 1;
        unidadesPorVencer += lote.quantity;
        porVencer.add(variante.variant_id);
      }
    }
  }

  return {
    lotesVencidos,
    lotesPorVencer,
    unidadesVencidas,
    unidadesPorVencer,
    variantesVencidas: vencidas.size,
    variantesPorVencer: porVencer.size,
    variantesConAlerta: new Set([...vencidas, ...porVencer]).size,
    variantesSinFecha,
    totalVariantes: variantes.length,
  };
}

export function filtrarPorVencimiento<T extends VarianteVencimiento>(
  variantes: T[],
  filtro: FiltroVencimiento,
  umbral: number = UMBRAL_POR_VENCER
): T[] {
  if (filtro === "todos") return variantes;

  return variantes.filter((variante) => {
    if (filtro === "sin_fecha") {
      return fechaVencimiento(variante.batches) === null;
    }

    return variante.batches.some((lote) => {
      const estado = estadoVencimiento(lote.expiration_date, umbral);
      if (filtro === "alertas") {
        return estado === "vencido" || estado === "por_vencer";
      }
      return filtro === "vencidos"
        ? estado === "vencido"
        : estado === "por_vencer";
    });
  });
}
