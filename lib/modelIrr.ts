/**
 * TIR implícita del modelo de analista — Flujos Totales al Accionista, con fechas (XIRR).
 *
 *   Hoy          : −(market cap al precio de entrada)
 *   31-dic año 1..N−1 : + dividendos (+ recompras) proyectados del año
 *   31-dic año N : + dividendos del año + valor de salida (base del año N × múltiplo de salida)
 *
 * La salida es genérica: empresas usan Net Income × P/E; bancos, Controlling Equity × P/BV
 * teórico ((ROE − g) / (Ke − g), ver theoreticalPbv).
 *
 * Igual que =XIRR de Excel: cada flujo se descuenta por (días desde hoy) / 365, así el
 * primer año proyectado sólo pesa la fracción de año que queda.
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
  exitBase:     number | null;   // base de la salida: Net Income (empresas) o Controlling Equity (bancos)
  dividend:     number | null;   // el modelo lo trae NEGATIVO (salida de caja)
  buybacks:     number | null;   // ídem
}

export interface IrrParams {
  horizon:         number;                   // años de flujo (1..N)
  exitMultiple:    number;                   // múltiplo de salida (P/E o P/BV)
  entryScale:      number;                   // precio de entrada / precio de mercado (1 = precio actual)
  includeBuybacks: boolean;                  // sumar recompras a los flujos al accionista
  asOf:            Date;                     // fecha de entrada (hoy)
  divOverrides?:   Record<number, number>;   // año → flujo al accionista editado (positivo)
  baseOverrides?:  Record<number, number>;   // año → base de salida editada
}

export interface IrrFlow {
  t:          number;            // 0 = hoy
  year:       number | null;     // año del modelo (null en t = 0)
  date:       string;            // ISO (yyyy-mm-dd) del flujo
  days:       number;            // días desde hoy
  dividend:   number;            // dividendos (+ recompras) del año, positivo
  exitBase:   number | null;     // base de salida del año (la del año N arma la salida)
  exit:       number;            // valor de salida (sólo en t = N)
  total:      number;            // flujo total del período
  divEdited:  boolean;
  baseEdited: boolean;
}

export interface IrrResult {
  irr:      number | null;
  flows:    IrrFlow[];
  baseMcap: number | null;       // market cap de mercado del año de entrada (entryScale = 1)
  entry:    number | null;       // market cap de entrada (positivo)
  exitBase: number | null;       // base usada en la salida
  issue:    string | null;       // por qué no hay TIR (o por qué no es representativa)
}

/**
 * P/BV teórico (Gordon sobre el patrimonio): (ROE − g) / (Ke − g).
 * Un banco que gana su costo de capital (ROE = Ke) vale 1x libro. null si Ke ≤ g.
 */
export function theoreticalPbv(roe: number, g: number, ke: number): number | null {
  return ke > g ? (roe - g) / (ke - g) : null;
}

const DAY_MS = 86_400_000;
const utcDay = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
const isoOf  = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * XIRR (equivalente a =XIRR de Excel): tasa r con Σ Fᵢ / (1+r)^(díasᵢ/365) = 0.
 * Newton desde 10% con fallback a bisección en [−99%, 1000%].
 */
export function xirr(flows: number[], days: number[]): number | null {
  if (flows.length < 2 || flows.length !== days.length) return null;
  if (!flows.some(f => f > 0) || !flows.some(f => f < 0)) return null;
  const tau = days.map(d => d / 365);

  const npv  = (r: number) => flows.reduce((s, f, i) => s + f / Math.pow(1 + r, tau[i]), 0);
  const dnpv = (r: number) => flows.reduce((s, f, i) => s - (tau[i] * f) / Math.pow(1 + r, tau[i] + 1), 0);

  let r = 0.1;
  for (let i = 0; i < 50; i++) {
    const v = npv(r), d = dnpv(r);
    if (!isFinite(v) || !isFinite(d) || d === 0) break;
    const next = r - v / d;
    if (!isFinite(next) || next <= -0.9999) break;
    if (Math.abs(next - r) < 1e-9) return next;
    r = next;
  }

  let lo = -0.9999, hi = 10;
  let flo = npv(lo);
  const fhi = npv(hi);
  if (!isFinite(flo) || !isFinite(fhi) || flo * fhi > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fm = npv(mid);
    if (Math.abs(fm) < 1e-9 || hi - lo < 1e-10) return mid;
    if (flo * fm < 0) hi = mid; else { lo = mid; flo = fm; }
  }
  return (lo + hi) / 2;
}

/**
 * Años proyectados utilizables para la TIR: consecutivos desde el primer año proyectado,
 * mientras tengan base de salida (el dividendo puede faltar → se toma 0).
 */
export function irrYears(projected: IrrYearInput[]): IrrYearInput[] {
  const out: IrrYearInput[] = [];
  for (const y of projected) {
    if (y.exitBase === null) break;
    out.push(y);
  }
  return out;
}

export function computeModelIrr(projected: IrrYearInput[], p: IrrParams): IrrResult {
  const years = irrYears(projected);
  const empty = (issue: string): IrrResult => ({ irr: null, flows: [], baseMcap: null, entry: null, exitBase: null, issue });

  if (years.length === 0) return empty("El modelo no tiene años proyectados con la base de salida.");
  const mcap = years[0].effMarketCap;
  if (!mcap || mcap <= 0) return empty("Sin market cap para el año de entrada.");
  if (!(p.exitMultiple > 0)) return empty("El múltiplo de salida debe ser mayor que 0.");

  const n     = Math.max(1, Math.min(Math.round(p.horizon), years.length));
  const today = utcDay(p.asOf);
  const entry = mcap * p.entryScale;
  const flows: IrrFlow[] = [{
    t: 0, year: null, date: isoOf(today), days: 0,
    dividend: 0, exitBase: null, exit: 0, total: -entry, divEdited: false, baseEdited: false,
  }];

  for (let t = 1; t <= n; t++) {
    const y      = years[t - 1];
    const divOv  = p.divOverrides?.[y.year];
    const baseOv = p.baseOverrides?.[y.year];
    const div    = divOv ?? Math.abs(y.dividend ?? 0) + (p.includeBuybacks ? Math.abs(y.buybacks ?? 0) : 0);
    const base   = baseOv ?? y.exitBase;
    const ex     = t === n ? (base ?? 0) * p.exitMultiple : 0;
    // Flujo al cierre del año (31-dic); si ese día ya pasó, se toma hoy.
    const at     = Math.max(Date.UTC(y.year, 11, 31), today);
    flows.push({
      t, year: y.year, date: isoOf(at), days: Math.round((at - today) / DAY_MS),
      dividend: div, exitBase: base, exit: ex, total: div + ex,
      divEdited: divOv !== undefined, baseEdited: baseOv !== undefined,
    });
  }

  const exitBase = flows[n].exitBase;
  const value    = xirr(flows.map(f => f.total), flows.map(f => f.days));
  return {
    irr: value, flows, baseMcap: mcap, entry, exitBase,
    issue: exitBase !== null && exitBase <= 0
      ? "La base de salida del último año es ≤ 0: el valor de salida no es representativo."
      : value === null ? "La serie de flujos no tiene TIR." : null,
  };
}
