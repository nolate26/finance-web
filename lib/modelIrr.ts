/**
 * TIR implícita del modelo de analista — Flujos Totales al Accionista.
 *
 *   Año 0        : −(precio de entrada)            → hoy
 *   Años 1..N−1  : + dividendos proyectados del año
 *   Año N        : + dividendo del año + valor de salida (utilidad del año N × P/E de salida)
 *
 * Se calcula sobre AGREGADOS (market cap, dividendos, net income en la escala de los
 * financials) y no por acción. Con acciones constantes es exactamente la misma TIR, y
 * evita los dos problemas del cálculo por acción en este modelo:
 *  • moneda/escala: el precio está en LCCY y DPS/EPS en la moneda del modelo; el market
 *    cap efectivo ya viene convertido con fxEop (lib/modelMultiples).
 *  • dual-class (has_series): precio de una serie × acciones totales no es el market cap;
 *    el market cap efectivo ya usa el de Bloomberg.
 * Además el P/E de salida queda consistente con el P/E que muestra la tabla (mcap / NI).
 */

export interface IrrYearInput {
  year:         number;
  effMarketCap: number | null;   // escala de los financials (ya con precio vivo en proyectados)
  netIncome:    number | null;
  dividend:     number | null;   // el modelo lo trae NEGATIVO (salida de caja)
  buybacks:     number | null;   // ídem
}

export interface IrrParams {
  horizon:         number;       // años de flujo (1..N)
  exitPe:          number;       // P/E de salida objetivo
  entryScale:      number;       // precio de entrada / precio de mercado (1 = precio actual)
  includeBuybacks: boolean;      // sumar recompras a los flujos al accionista
}

export interface IrrFlow {
  t:        number;              // 0 = hoy
  year:     number | null;       // año del modelo (null en t = 0)
  dividend: number;              // dividendos (+ recompras) del año, positivo
  exit:     number;              // valor de salida (sólo en t = N)
  total:    number;              // flujo total del período
}

export interface IrrResult {
  irr:     number | null;
  flows:   IrrFlow[];
  entry:   number | null;        // market cap de entrada (positivo)
  exitNi:  number | null;        // utilidad usada en la salida
  issue:   string | null;        // por qué no hay TIR, si no la hay
}

/** TIR de una serie de flujos anuales (equivalente a =IRR de Excel). Newton con fallback a bisección. */
export function irr(flows: number[]): number | null {
  if (flows.length < 2) return null;
  const hasPos = flows.some(f => f > 0);
  const hasNeg = flows.some(f => f < 0);
  if (!hasPos || !hasNeg) return null;

  const npv  = (r: number) => flows.reduce((s, f, t) => s + f / Math.pow(1 + r, t), 0);
  const dnpv = (r: number) => flows.reduce((s, f, t) => s - (t * f) / Math.pow(1 + r, t + 1), 0);

  // Newton desde 10%.
  let r = 0.1;
  for (let i = 0; i < 50; i++) {
    const v = npv(r), d = dnpv(r);
    if (!isFinite(v) || !isFinite(d) || d === 0) break;
    const next = r - v / d;
    if (!isFinite(next) || next <= -0.9999) break;
    if (Math.abs(next - r) < 1e-9) return next;
    r = next;
  }

  // Bisección en [-99%, 1000%] si Newton no converge.
  let lo = -0.9999, hi = 10;
  let flo = npv(lo), fhi = npv(hi);
  if (!isFinite(flo) || !isFinite(fhi) || flo * fhi > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fm = npv(mid);
    if (Math.abs(fm) < 1e-9 || hi - lo < 1e-10) return mid;
    if (flo * fm < 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
  }
  return (lo + hi) / 2;
}

/**
 * Años proyectados utilizables para la TIR: consecutivos desde el primer año proyectado,
 * mientras tengan net income (el dividendo puede faltar → se toma 0).
 */
export function irrYears(projected: IrrYearInput[]): IrrYearInput[] {
  const out: IrrYearInput[] = [];
  for (const y of projected) {
    if (y.netIncome === null) break;
    out.push(y);
  }
  return out;
}

export function computeModelIrr(projected: IrrYearInput[], p: IrrParams): IrrResult {
  const years = irrYears(projected);
  const empty = (issue: string): IrrResult => ({ irr: null, flows: [], entry: null, exitNi: null, issue });

  if (years.length === 0) return empty("El modelo no tiene años proyectados con Net Income.");
  const mcap = years[0].effMarketCap;
  if (!mcap || mcap <= 0) return empty("Sin market cap para el año de entrada.");
  if (!(p.exitPe > 0)) return empty("El P/E de salida debe ser mayor que 0.");

  const n = Math.max(1, Math.min(Math.round(p.horizon), years.length));
  const entry = mcap * p.entryScale;
  const flows: IrrFlow[] = [{ t: 0, year: null, dividend: 0, exit: 0, total: -entry }];

  for (let t = 1; t <= n; t++) {
    const y   = years[t - 1];
    const div = Math.abs(y.dividend ?? 0) + (p.includeBuybacks ? Math.abs(y.buybacks ?? 0) : 0);
    const ex  = t === n ? (y.netIncome ?? 0) * p.exitPe : 0;
    flows.push({ t, year: y.year, dividend: div, exit: ex, total: div + ex });
  }

  const exitNi = years[n - 1].netIncome;
  const value  = irr(flows.map(f => f.total));
  return {
    irr: value, flows, entry, exitNi,
    issue: exitNi !== null && exitNi <= 0
      ? "Net Income del año de salida ≤ 0: el valor de salida no es representativo."
      : value === null ? "La serie de flujos no tiene TIR." : null,
  };
}
