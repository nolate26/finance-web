// Sufijo estándar de moneda + unidad para las cabeceras "Reported CCY" de los
// modelos (analista y banco), en pantalla y en el export a Excel.
//
//   ("CLP mm", "mn")  →  " : CLP mm · mn"
//   ("USD", null)     →  " : USD"
//   (null, null)      →  ""
//
// Devuelve el separador incluido para poder concatenarlo directo:
//   `Reported CCY${ccySuffix(header.currency, header.unit)}`
export function ccySuffix(currency: string | null, unit: string | null): string {
  const parts = [currency, unit]
    .filter((p): p is string => !!p?.trim())
    .map((p) => p.trim());
  return parts.length > 0 ? ` : ${parts.join(" · ")}` : "";
}
