// Formato de precios en moneda local. No se fija una moneda concreta:
// se muestra el símbolo "$" y dos decimales.

export function formatearPrecio(precio: number | null | undefined): string {
  if (precio === null || precio === undefined) return "Sin precio";

  return `$ ${precio.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// Valor plano para el CSV (sin símbolo ni separador de miles).
export function precioCSV(precio: number | null | undefined): string {
  if (precio === null || precio === undefined) return "";
  return precio.toFixed(2);
}

export function subtotal(
  precio: number | null | undefined,
  cantidad: number
): number | null {
  if (precio === null || precio === undefined) return null;
  return Math.round(precio * cantidad * 100) / 100;
}
