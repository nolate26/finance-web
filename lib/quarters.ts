/**
 * Quarters de las fichas de compañía.
 *
 * Formato visible: "2Q26" (trimestre + año de dos dígitos), que es como los nombra
 * el equipo en los archivos ("CCU_2Q26.pdf"). En la base viajan separados
 * (fiscal_year + quarter) para poder ordenar y filtrar sin parsear texto.
 */

export interface Quarter {
  fiscalYear: number;
  quarter:    number;   // 1..4
}

/** "2Q26" */
export function quarterLabel(fiscalYear: number, quarter: number): string {
  return `${quarter}Q${String(fiscalYear).slice(-2)}`;
}

/** Clave numérica para ordenar y comparar quarters (mayor = más nuevo). */
export function quarterKey(fiscalYear: number, quarter: number): number {
  return fiscalYear * 4 + quarter;
}

/** Quarter CALENDARIO de una fecha (default: hoy). */
export function currentQuarter(d = new Date()): Quarter {
  return { fiscalYear: d.getFullYear(), quarter: Math.floor(d.getMonth() / 3) + 1 };
}

/** Resta `n` quarters (n negativo = suma). */
export function shiftQuarter({ fiscalYear, quarter }: Quarter, n: number): Quarter {
  const idx = fiscalYear * 4 + (quarter - 1) - n;
  return { fiscalYear: Math.floor(idx / 4), quarter: (idx % 4) + 1 };
}

/**
 * Opciones para el selector del uploader: `ahead` quarters futuros primero (un
 * informe puede cerrarse antes de que termine el trimestre), después el actual y
 * `back` hacia atrás. De más nuevo a más viejo.
 */
export function quarterOptions(back = 7, ahead = 1, from = currentQuarter()): Quarter[] {
  const out: Quarter[] = [];
  for (let i = -ahead; i <= back; i++) out.push(shiftQuarter(from, i));
  return out;
}

/** Acepta "2Q26", "2q2026", "2Q 26". Devuelve null si no calza. */
export function parseQuarterLabel(s: string): Quarter | null {
  const m = s.trim().match(/^([1-4])\s*Q\s*(\d{2}|\d{4})$/i);
  if (!m) return null;
  const q  = Number(m[1]);
  const yy = Number(m[2]);
  return { quarter: q, fiscalYear: yy < 100 ? 2000 + yy : yy };
}

export function isValidQuarter(fiscalYear: unknown, quarter: unknown): boolean {
  return Number.isInteger(fiscalYear) && (fiscalYear as number) >= 2000 && (fiscalYear as number) <= 2100
      && Number.isInteger(quarter)    && (quarter as number)    >= 1    && (quarter as number)    <= 4;
}
