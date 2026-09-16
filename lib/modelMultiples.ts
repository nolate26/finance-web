/**
 * Múltiplos de mercado del modelo de analista — implementación ÚNICA compartida por
 * ModelExplorer / BankModelExplorer (deep-dive) y /api/latam/consensus-check (tabla
 * Estimates), para que EV/EBITDA y P/E sean exactamente el mismo número en ambos lados.
 *
 * `live` es la última fila de price_range_52w (px_last + market_cap de Bloomberg) y SÓLO debe
 * pasarse en años proyectados; en años históricos el caller manda null y se usa el market_cap
 * que dejó el analista.
 */

// ── Market cap efectivo ────────────────────────────────────────────────────────

export interface CompanyMcapInputs {
  sharePrice: number | null;
  sharesOut:  number | null;
  marketCap:  number | null;
  fxEop:      number | null;
}

/** Última cotización de price_range_52w: px_last y, desde 2026-09-16, el market cap de Bloomberg. */
export interface LiveQuote {
  price:     number;
  marketCap: number | null;
}

/** De dónde salió el market cap efectivo (la UI resalta los dos orígenes "vivos"). */
export type McapSource = "live_mcap" | "live_price" | "model" | "none";

// El market_cap de price_range_52w llega en UNIDADES de moneda (Bloomberg: 4,02e12 CLP para
// Andina) mientras que precio × shares_out del modelo queda en millones (o miles, si el analista
// cargó las acciones en miles). Para que `× fxEop` lo deje en la escala de los financials hay que
// llevarlo primero a la escala de precio × acciones: el cociente entre ambos es una potencia de
// 10 limpia (1e6, 1e3…) más el descuento real entre series (0.8–1.2), así que redondear el log10
// recupera el factor sin ambigüedad. Mismo criterio que consensusScaleFactor para el consenso.
export function liveMarketCapAtPriceSharesScale(liveMarketCap: number, price: number, sharesOut: number): number | null {
  const ref = price * sharesOut;
  if (!liveMarketCap || !ref || liveMarketCap < 0 || ref < 0) return null;
  const factor = Math.pow(10, Math.round(Math.log10(liveMarketCap / ref)));
  return liveMarketCap / factor;
}

// Market cap en la escala de los financials (revenue/EBITDA/NI). Reglas:
//  • Proyectado + has_series (dual-class, ej. Andina A/B): precio de UNA serie × todas las
//    acciones sobreestima el market cap, así que se usa el market cap de Bloomberg (todas las
//    series) llevado a la escala de precio×acciones y × fxEop. Si esa fila aún no trae market
//    cap, cae a la regla siguiente.
//  • Proyectado (precio vivo): se arma desde precio×acciones CRUDO y el fxEop del analista lo
//    lleva a la escala de los financials (ej. CLP: fxEop=0.001, porque precio×acciones queda en
//    CLP mn y los financials están en CLP bn).
//  • Resto de años: la columna market_cap del modelo YA viene en esa escala → se usa tal cual.
//    Aplicarle fxEop encima la escalaría DOS veces (ese era el bug del histórico: los yields
//    salían ~1000× altos y el market cap real no cuadraba con el proyectado).
//  • Sin market_cap: se reconstruye desde precio×acciones × fxEop.
export function companyEffMarketCapDetailed(
  f: CompanyMcapInputs, live: LiveQuote | null, hasSeries = false,
): { value: number | null; source: McapSource } {
  if (live !== null && f.sharesOut !== null) {
    if (hasSeries && live.marketCap !== null) {
      const scaled = liveMarketCapAtPriceSharesScale(live.marketCap, live.price, f.sharesOut);
      if (scaled !== null) return { value: scaled * (f.fxEop ?? 1), source: "live_mcap" };
    }
    return { value: live.price * f.sharesOut * (f.fxEop ?? 1), source: "live_price" };
  }
  if (f.marketCap !== null) return { value: f.marketCap, source: "model" };
  if (f.sharePrice !== null && f.sharesOut !== null) {
    return { value: f.sharePrice * f.sharesOut * (f.fxEop ?? 1), source: "model" };
  }
  return { value: null, source: "none" };
}

export function companyEffMarketCap(f: CompanyMcapInputs, live: LiveQuote | null, hasSeries = false): number | null {
  return companyEffMarketCapDetailed(f, live, hasSeries).value;
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
