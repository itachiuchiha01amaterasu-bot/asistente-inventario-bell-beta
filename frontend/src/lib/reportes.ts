import {
  diasHastaVencimiento,
  estadoVencimiento,
  fechaVencimiento,
  formatearFecha,
  textoEstadoVencimiento,
  UMBRAL_POR_VENCER,
  type VarianteVencimiento,
} from "./vencimientos";

export type FilaCSV = string[];

const contenido = (variante: VarianteVencimiento) =>
  variante.content_value !== null && variante.content_unit
    ? `${variante.content_value} ${variante.content_unit}`
    : "Por definir";

const ordenarVariantes = (variantes: VarianteVencimiento[]) =>
  [...variantes].sort(
    (a, b) =>
      a.category.localeCompare(b.category, "es") ||
      a.product_name.localeCompare(b.product_name, "es") ||
      a.brand.localeCompare(b.brand, "es") ||
      a.type_variety.localeCompare(b.type_variety, "es")
  );

export function filasInventario(
  variantes: VarianteVencimiento[]
): FilaCSV[] {
  const filas: FilaCSV[] = [
    [
      "Rubro",
      "Producto",
      "Marca",
      "Variedad",
      "Contenido",
      "SKU",
      "Stock total",
      "Lotes",
      "Vencimiento más próximo",
      "Estado",
    ],
  ];

  for (const variante of ordenarVariantes(variantes)) {
    const vencimiento = fechaVencimiento(variante.batches);
    const estado = estadoVencimiento(vencimiento);

    filas.push([
      variante.category,
      variante.product_name,
      variante.brand,
      variante.type_variety || "Sin variedad",
      contenido(variante),
      variante.sku_code || "",
      String(variante.total_quantity),
      String(variante.batches.length),
      formatearFecha(vencimiento),
      textoEstadoVencimiento(estado),
    ]);
  }

  return filas;
}

export function filasVencimientos(
  variantes: VarianteVencimiento[],
  umbral: number = UMBRAL_POR_VENCER
): FilaCSV[] {
  const registros: {
    variante: VarianteVencimiento;
    lote: VarianteVencimiento["batches"][number];
    dias: number | null;
  }[] = [];

  for (const variante of variantes) {
    for (const lote of variante.batches) {
      registros.push({
        variante,
        lote,
        dias: diasHastaVencimiento(lote.expiration_date),
      });
    }
  }

  // Primero lo más urgente; los lotes sin fecha van al final.
  registros.sort((a, b) => {
    if (a.dias === null && b.dias === null) {
      return a.variante.product_name.localeCompare(
        b.variante.product_name,
        "es"
      );
    }
    if (a.dias === null) return 1;
    if (b.dias === null) return -1;
    return a.dias - b.dias;
  });

  const filas: FilaCSV[] = [
    [
      "Estado",
      "Días restantes",
      "Rubro",
      "Producto",
      "Marca",
      "Variedad",
      "Contenido",
      "Lote",
      "Cantidad",
      "Ingreso",
      "Vencimiento",
    ],
  ];

  for (const { variante, lote, dias } of registros) {
    const estado = estadoVencimiento(lote.expiration_date, umbral);

    filas.push([
      textoEstadoVencimiento(estado),
      dias === null ? "" : String(dias),
      variante.category,
      variante.product_name,
      variante.brand,
      variante.type_variety || "Sin variedad",
      contenido(variante),
      `#${lote.id}`,
      String(lote.quantity),
      formatearFecha(lote.arrival_date),
      formatearFecha(lote.expiration_date),
    ]);
  }

  return filas;
}

export function filasStockBajo(
  variantes: VarianteVencimiento[],
  umbral: number = 10
): FilaCSV[] {
  const filas: FilaCSV[] = [
    [
      "Rubro",
      "Producto",
      "Marca",
      "Variedad",
      "Contenido",
      "Stock total",
      "Lotes",
      "Vencimiento más próximo",
      "Estado",
    ],
  ];

  const bajos = variantes
    .filter((variante) => variante.total_quantity < umbral)
    .sort(
      (a, b) =>
        a.total_quantity - b.total_quantity ||
        a.product_name.localeCompare(b.product_name, "es")
    );

  for (const variante of bajos) {
    const vencimiento = fechaVencimiento(variante.batches);
    const estado = estadoVencimiento(vencimiento);

    filas.push([
      variante.category,
      variante.product_name,
      variante.brand,
      variante.type_variety || "Sin variedad",
      contenido(variante),
      String(variante.total_quantity),
      String(variante.batches.length),
      formatearFecha(vencimiento),
      textoEstadoVencimiento(estado),
    ]);
  }

  return filas;
}

export function filasResumenRubros(
  variantes: VarianteVencimiento[],
  umbral: number = UMBRAL_POR_VENCER
): FilaCSV[] {
  type Resumen = {
    variantes: number;
    unidades: number;
    lotes: number;
    lotesVencidos: number;
    lotesPorVencer: number;
    variantesSinFecha: number;
  };

  const resumen = new Map<string, Resumen>();

  for (const variante of variantes) {
    const rubro = variante.category || "Sin rubro";
    const actual = resumen.get(rubro) || {
      variantes: 0,
      unidades: 0,
      lotes: 0,
      lotesVencidos: 0,
      lotesPorVencer: 0,
      variantesSinFecha: 0,
    };

    actual.variantes += 1;
    actual.unidades += variante.total_quantity;
    actual.lotes += variante.batches.length;

    if (fechaVencimiento(variante.batches) === null) {
      actual.variantesSinFecha += 1;
    }

    for (const lote of variante.batches) {
      const estado = estadoVencimiento(lote.expiration_date, umbral);
      if (estado === "vencido") actual.lotesVencidos += 1;
      if (estado === "por_vencer") actual.lotesPorVencer += 1;
    }

    resumen.set(rubro, actual);
  }

  const filas: FilaCSV[] = [
    [
      "Rubro",
      "Variantes",
      "Unidades",
      "Lotes",
      "Lotes vencidos",
      "Lotes por vencer",
      "Variantes sin fecha",
    ],
  ];

  for (const [rubro, datos] of [...resumen.entries()].sort((a, b) =>
    a[0].localeCompare(b[0], "es")
  )) {
    filas.push([
      rubro,
      String(datos.variantes),
      String(datos.unidades),
      String(datos.lotes),
      String(datos.lotesVencidos),
      String(datos.lotesPorVencer),
      String(datos.variantesSinFecha),
    ]);
  }

  return filas;
}

function escaparCampo(valor: string): string {
  const texto = String(valor ?? "");

  // Excel en español usa ";" como separador. Se entrecomilla solo cuando
  // el valor contiene el separador, comillas o saltos de línea.
  if (/[;"\r\n]/.test(texto)) {
    return `"${texto.replace(/"/g, '""')}"`;
  }

  return texto;
}

export function crearCSV(filas: FilaCSV[]): string {
  const cuerpo = filas
    .map((fila) => fila.map(escaparCampo).join(";"))
    .join("\r\n");

  // BOM UTF-8 para que Excel muestre bien tildes y ñ.
  return `\uFEFF${cuerpo}`;
}

export function nombreReporte(prefijo: string): string {
  const hoy = new Date();
  const anio = hoy.getFullYear();
  const mes = String(hoy.getMonth() + 1).padStart(2, "0");
  const dia = String(hoy.getDate()).padStart(2, "0");

  return `${prefijo}_${anio}-${mes}-${dia}.csv`;
}

export function descargarCSV(nombreArchivo: string, filas: FilaCSV[]): void {
  if (typeof window === "undefined") return;

  const csv = crearCSV(filas);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");

  enlace.href = url;
  enlace.download = nombreArchivo.endsWith(".csv")
    ? nombreArchivo
    : `${nombreArchivo}.csv`;
  enlace.style.display = "none";

  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();

  // Dar tiempo al navegador a iniciar la descarga antes de liberar la URL.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
