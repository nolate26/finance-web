/**
 * Recomendación de un investment case sobre una acción.
 *
 * Tres valores cerrados a propósito: los modelos de analista guardan texto libre
 * ("Buy", "OW", "Outperform") y eso obliga a normalizar en cada lectura. Acá lo
 * elige el que sube desde un selector, así que se guarda ya canonizado.
 */
export const RECOMMENDATIONS = ["BUY", "HOLD", "SELL"] as const;

export type Recommendation = (typeof RECOMMENDATIONS)[number];

export function isRecommendation(v: unknown): v is Recommendation {
  return typeof v === "string" && (RECOMMENDATIONS as readonly string[]).includes(v);
}

/** Colores del manual: compra azul, venta rosado, mantener gris. */
export function recommendationColors(r: string | null | undefined): { text: string; bg: string; border: string } {
  switch (r) {
    case "BUY":  return { text: "#001EAF", bg: "rgba(0,30,175,0.10)",  border: "rgba(0,30,175,0.25)" };
    case "SELL": return { text: "#F8485E", bg: "rgba(248,72,94,0.10)", border: "rgba(248,72,94,0.25)" };
    default:     return { text: "rgba(13,13,56,0.62)", bg: "rgba(13,13,56,0.07)", border: "rgba(13,13,56,0.18)" };
  }
}

/** Target price: sin decimales sobre 100, con uno abajo. Igual que la tabla de Estimates. */
export function formatTargetPrice(v: number | null | undefined): string {
  if (v == null) return "—";
  const d = Math.abs(v) < 100 ? 1 : 0;
  return v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}
