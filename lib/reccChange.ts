// Comparación de recomendación / TP / tesis entre dos versiones de un modelo. Puro (sin
// prisma): lo usan el aviso de Telegram, el endpoint de revisión y el modal del cliente.

export const RECC_OPTIONS = ["BUY", "HOLD", "SELL"] as const;

/** 2 = positiva, 1 = neutral, 0 = negativa, null = texto que no se reconoce. */
export function reccRank(recc: string | null | undefined): number | null {
  const u = (recc ?? "").trim().toUpperCase();
  if (!u) return null;
  if (u.includes("SELL") || u === "UW" || u.includes("UNDERWEIGHT") || u.includes("UNDERPERFORM")) return 0;
  if (u.includes("BUY")  || u === "OW" || u.includes("OVERWEIGHT")  || u.includes("OUTPERFORM"))   return 2;
  if (u.includes("HOLD") || u === "MW" || u.includes("NEUTRAL")     || u.includes("MARKET"))       return 1;
  return null;
}

export function normRecc(recc: string | null | undefined): string | null {
  const u = (recc ?? "").trim().toUpperCase();
  return u || null;
}

export function reccChanged(a: string | null | undefined, b: string | null | undefined): boolean {
  return normRecc(a) !== normRecc(b);
}

export function tpChanged(a: number | null | undefined, b: number | null | undefined): boolean {
  if (a == null || b == null) return (a == null) !== (b == null);
  return Math.abs(a - b) > 1e-9;
}

export function thesisChanged(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? "").trim() !== (b ?? "").trim();
}

/** "upgrade" | "downgrade" | null (sin cambio o recomendación no reconocida). */
export function reccDirection(from: string | null | undefined, to: string | null | undefined): "upgrade" | "downgrade" | null {
  const a = reccRank(from), b = reccRank(to);
  if (a == null || b == null || a === b) return null;
  return b > a ? "upgrade" : "downgrade";
}

/** Fecha de hoy en Chile como "YYYY-MM-DD": es la fecha que toma una revisión manual. */
export function todayIsoSantiago(): string {
  // en-CA formatea como YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
}
