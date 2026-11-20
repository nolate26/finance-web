/**
 * DCF automático del modelo de analista, con todos los años proyectados que tenga el modelo.
 *
 *   Empresas (FCFF a WACC), armado desde el EBIT:
 *     Revenue × EBIT Mg = EBIT → NOPAT = EBIT × (1 − t)
 *     FCFF = NOPAT + D&A − Capex − Var WK
 *     EV − deuda neta − minoritarios (del año base) = patrimonio
 *   Bancos (DDM a Ke): flujo = dividendos + recompras; ya es patrimonio.
 *
 *   Perpetuidad (al cierre del último año) = flujo terminal × (1 + g) / (r − g)
 *
 * Convención de la planilla del equipo: se valora al 31-dic del AÑO BASE (el anterior al
 * primer año de flujo) y cada año se descuenta por su período entero, (1 + r)^−(año − base).
 * Por defecto el año en curso queda fuera (ya está casi corrido) y el año base es el actual.
 *
 * Como la TIR, se calcula sobre AGREGADOS en la escala de los financials y el precio por
 * acción sale por razón contra el market cap efectivo:
 *   precio implícito = precio de referencia × patrimonio / market cap efectivo
 * Eso evita convertir moneda/escala y el problema de las series (has_series).
 */

export interface DcfYearInput {
  year: number;
  flow: number | null;   // flujo del año (positivo = entra caja), escala de los financials
}

export interface DcfParams {
  rate:           number;                    // WACC (empresas) o Ke (bancos), decimal
  growth:         number;                    // crecimiento terminal g, decimal
  baseYear:       number;                    // se valora al 31-dic de este año
  flowOverrides?: Record<number, number>;    // año → flujo editado
  terminalFlow:   number | null;             // flujo base de la perpetuidad (año N)
  bridge:         number;                    // EV → patrimonio: deuda neta + minoritarios (0 en bancos)
  refMcap:        number | null;             // market cap efectivo de referencia
  refPrice:       number | null;             // precio detrás de refMcap (LCCY)
}

export interface DcfFlow {
  year:   number;
  period: number;   // año − año base
  flow:   number;
  edited: boolean;
  df:     number;   // factor de descuento
  pv:     number;
}

export interface DcfResult {
  flows:     DcfFlow[];
  pvFlows:   number;
  tv:        number | null;   // perpetuidad al cierre del año N (sin descontar)
  pvTv:      number | null;
  ev:        number | null;   // flujos + perpetuidad (EV en empresas, patrimonio en bancos)
  equity:    number | null;
  price:     number | null;   // precio implícito por acción (LCCY)
  upside:    number | null;   // vs refPrice
  tvShare:   number | null;   // peso de la perpetuidad en el valor total
  issue:     string | null;
}

/** Años proyectados utilizables: consecutivos desde el primero, mientras tengan flujo. */
export function dcfYears(projected: DcfYearInput[]): DcfYearInput[] {
  const out: DcfYearInput[] = [];
  for (const y of projected) {
    if (y.flow === null) break;
    out.push(y);
  }
  return out;
}

export function computeModelDcf(years: DcfYearInput[], p: DcfParams): DcfResult {
  const empty = (issue: string): DcfResult => ({
    flows: [], pvFlows: 0, tv: null, pvTv: null, ev: null, equity: null, price: null, upside: null, tvShare: null, issue,
  });
  if (years.length === 0) return empty("El modelo no tiene años proyectados con flujo.");

  const flows: DcfFlow[] = years.map(y => {
    const ov     = p.flowOverrides?.[y.year];
    const flow   = ov ?? y.flow ?? 0;
    const period = y.year - p.baseYear;
    const df     = Math.pow(1 + p.rate, -period);
    return { year: y.year, period, flow, edited: ov !== undefined, df, pv: flow * df };
  });
  const pvFlows = flows.reduce((s, f) => s + f.pv, 0);

  if (!(p.rate > p.growth)) {
    return { ...empty("La tasa de descuento debe ser mayor que g."), flows, pvFlows };
  }
  if (p.terminalFlow === null) {
    return { ...empty("Sin flujo terminal."), flows, pvFlows };
  }

  const last    = flows[flows.length - 1];
  const tv      = p.terminalFlow * (1 + p.growth) / (p.rate - p.growth);
  const pvTv    = tv * last.df;
  const ev      = pvFlows + pvTv;
  const equity  = ev - p.bridge;
  const price   = p.refMcap && p.refMcap > 0 && p.refPrice ? p.refPrice * equity / p.refMcap : null;
  const upside  = price !== null && p.refPrice ? price / p.refPrice - 1 : null;

  return {
    flows, pvFlows, tv, pvTv, ev, equity, price, upside,
    tvShare: ev !== 0 ? pvTv / ev : null,
    issue: p.terminalFlow <= 0 ? "El flujo terminal es ≤ 0: la perpetuidad no es representativa."
         : equity <= 0         ? "El patrimonio implícito es ≤ 0."
         : p.refMcap === null  ? "Sin market cap para llevar el valor a precio por acción."
         : null,
  };
}

// ── FCFF desde el EBIT (empresas) ───────────────────────────────────────────────

/** Un año del modelo, tal cual viene (signos del modelo; D&A y Capex se toman en absoluto). */
export interface FcffYearInput {
  year:     number;
  isEst:    boolean;
  revenue:  number | null;
  ebit:     number | null;
  taxRate:  number | null;   // decimal
  da:       number | null;
  capex:    number | null;
  wc:       number | null;   // nivel de capital de trabajo
  netDebt:  number | null;
}

/**
 * Drivers editables por año. Los márgenes y % se aplican sobre el revenue (editado o no),
 * así editar el revenue arrastra EBIT, D&A y Capex. Var WK se edita en absoluto.
 */
export type FcffField = "revenue" | "ebitMg" | "taxRate" | "daPct" | "capexPct" | "dwc";
export type FcffOverrides = Partial<Record<FcffField, Record<number, number>>>;

export interface FcffLine {
  year:     number;
  isEst:    boolean;
  revenue:  number | null;
  ebitMg:   number | null;
  ebit:     number | null;
  taxRate:  number | null;
  nopat:    number | null;
  da:       number | null;
  daPct:    number | null;
  capex:    number | null;   // NEGATIVO (salida de caja), como en la planilla
  capexPct: number | null;
  capexDa:  number | null;   // capex / D&A (x)
  dwc:      number | null;   // Var WK como flujo: − (WK_t − WK_t−1)
  fcff:     number | null;
  ebitda:   number | null;
  ebitdaMg: number | null;
  netDebt:  number | null;
  leverage: number | null;   // deuda neta / EBITDA
  edited:   Partial<Record<FcffField, boolean>>;
}

const pct = (x: number | null, rev: number | null) => (x === null || !rev ? null : x / rev);

/** Arma las líneas del FCFF para toda la serie (históricos sólo como referencia). */
export function buildFcff(series: FcffYearInput[], ov: FcffOverrides = {}): FcffLine[] {
  return series.map((y, i) => {
    const prev   = series[i - 1];
    const get    = (f: FcffField) => (y.isEst ? ov[f]?.[y.year] : undefined);
    const edited: FcffLine["edited"] = {};
    for (const f of ["revenue", "ebitMg", "taxRate", "daPct", "capexPct", "dwc"] as FcffField[]) {
      if (get(f) !== undefined) edited[f] = true;
    }

    const revenue  = get("revenue") ?? y.revenue;
    const ebitMg   = get("ebitMg") ?? pct(y.ebit, y.revenue);
    const ebit     = ebitMg !== null && revenue !== null ? revenue * ebitMg : y.ebit;
    const taxRate  = get("taxRate") ?? y.taxRate;
    const nopat    = ebit === null ? null : ebit * (1 - (taxRate ?? 0));

    const daPct    = get("daPct") ?? pct(y.da === null ? null : Math.abs(y.da), y.revenue);
    const da       = daPct !== null && revenue !== null ? revenue * daPct : y.da === null ? null : Math.abs(y.da);
    const capexPct = get("capexPct") ?? pct(y.capex === null ? null : Math.abs(y.capex), y.revenue);
    const capex    = capexPct !== null && revenue !== null ? -revenue * capexPct : y.capex === null ? null : -Math.abs(y.capex);
    const dwc      = get("dwc") ?? (y.wc !== null && prev?.wc != null ? -(y.wc - prev.wc) : null);

    const fcff     = nopat === null ? null : nopat + (da ?? 0) + (capex ?? 0) + (dwc ?? 0);
    const ebitda   = ebit === null ? null : ebit + (da ?? 0);

    return {
      year: y.year, isEst: y.isEst, revenue, ebitMg, ebit, taxRate, nopat,
      da, daPct, capex, capexPct, capexDa: capex !== null && da ? Math.abs(capex) / da : null,
      dwc, fcff, ebitda, ebitdaMg: pct(ebitda, revenue),
      netDebt: y.netDebt, leverage: y.netDebt !== null && ebitda ? y.netDebt / ebitda : null,
      edited,
    };
  });
}
