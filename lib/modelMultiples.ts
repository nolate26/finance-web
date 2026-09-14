/**
 * Múltiplos de mercado del modelo de analista — implementación ÚNICA compartida por
 * ModelExplorer / BankModelExplorer (deep-dive) y /api/latam/consensus-check (tabla
 * Estimates), para que EV/EBITDA y P/E sean exactamente el mismo número en ambos lados.
 *
 * `livePrice` es el px_last de price_range_52w y SÓLO debe pasarse en años proyectados;
 * en años históricos el caller manda null y se usa el market_cap que dejó el analista.
 */

// ── Market cap efectivo ────────────────────────────────────────────────────────

export interface CompanyMcapInputs {
  sharePrice: number | null;
  sharesOut:  number | null;
  marketCap:  number | null;
  fxEop:      number | null;
}

// Market cap en la escala de los financials (revenue/EBITDA/NI). Reglas:
//  • Precio vivo (proyectado): se arma desde precio×acciones CRUDO y el fxEop del analista lo
//    lleva a la escala de los financials (ej. CLP: fxEop=0.001, porque precio×acciones queda en
//    CLP mn y los financials están en CLP bn).
//  • Resto de años: la columna market_cap del modelo YA viene en esa escala → se usa tal cual.
//    Aplicarle fxEop encima la escalaría DOS veces (ese era el bug del histórico: los yields
//    salían ~1000× altos y el market cap real no cuadraba con el proyectado).
//  • Sin market_cap: se reconstruye desde precio×acciones × fxEop.
export function companyEffMarketCap(f: CompanyMcapInputs, livePrice: number | null): number | null {
  if (livePrice !== null && f.sharesOut !== null) return livePrice * f.sharesOut * (f.fxEop ?? 1);
  if (f.marketCap !== null) return f.marketCap;
  if (f.sharePrice !== null && f.sharesOut !== null) return f.sharePrice * f.sharesOut * (f.fxEop ?? 1);
  return null;
}

export interface BankMcapInputs {
  sharePrice: number | null;
  shares:     number | null;
  marketCap:  number | null;
}

// A diferencia del modelo de empresa, bank_financials NO tiene fxEop, así que no hay un
// factor explícito que lleve precio×acciones a la escala de los financials. Por eso la vía
// principal es re-marcar el market_cap del propio modelo por la razón de precios: hereda la
// escala de esa columna y no hay que asumir en qué unidad quedan precio×acciones.
//  • Precio vivo + market_cap + sharePrice del modelo → market_cap × (vivo / modelo).
//  • Precio vivo sin market_cap → precio×acciones crudo (asume misma escala).
//  • Resto de años → la columna market_cap tal cual, y si falta se reconstruye.
export function bankEffMarketCap(f: BankMcapInputs, livePrice: number | null): number | null {
  if (livePrice !== null && f.marketCap !== null && f.sharePrice !== null && f.sharePrice !== 0) {
    return f.marketCap * (livePrice / f.sharePrice);
  }
  if (livePrice !== null && f.shares !== null) return livePrice * f.shares;
  if (f.marketCap !== null) return f.marketCap;
  if (f.sharePrice !== null && f.shares !== null) return f.sharePrice * f.shares;
  return null;
}

// ── Múltiplos ──────────────────────────────────────────────────────────────────
// Cada uno conserva la semántica de división de su explorer de origen:
//  · empresa (sdiv): null si numerador o denominador es null/0.
//  · banco (divz):   null sólo con null o denominador 0 (numerador 0 → 0x).

// EV = Market Cap + Net Debt (sin minorities: el modelo del analista no las suma).
export function companyEv(effMarketCap: number | null, netDebt: number | null): number | null {
  return effMarketCap === null || netDebt === null ? null : effMarketCap + netDebt;
}

export function companyEvEbitda(effMarketCap: number | null, netDebt: number | null, ebitda: number | null): number | null {
  const ev = companyEv(effMarketCap, netDebt);
  return !ev || !ebitda ? null : ev / ebitda;
}

export function companyPe(effMarketCap: number | null, netIncome: number | null): number | null {
  return !effMarketCap || !netIncome ? null : effMarketCap / netIncome;
}

export function bankPe(effMarketCap: number | null, controllingNetIncome: number | null): number | null {
  return effMarketCap === null || controllingNetIncome === null || controllingNetIncome === 0
    ? null
    : effMarketCap / controllingNetIncome;
}
