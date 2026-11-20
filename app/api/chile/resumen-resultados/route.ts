import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normBBG } from "@/lib/bbg";
import { qKey, loadModelPicks } from "@/lib/ssFichaModel";

export const dynamic = "force-dynamic";

// Chile → Resumen de Resultados. Los flujos de la temporada de resultados, salidos de
// ficha_statements (macro "Send Ficha"):
//
//   · Trimestre vigente = el más reciente que tenga CUALQUIER ficha. Entran sólo las
//     compañías que ya lo reportaron; cuando la primera sube el trimestre siguiente, la vista
//     se reinicia con ella sola. Las que van atrasadas se listan en `pending`.
//   · Por línea: LTM y LTM-1, acumulado y acumulado n-1, trimestre y mismo trimestre n-4.
//
// Montos en la moneda reportada, en MILLONES (sin convertir): el front aplica el TC, igual que
// Stock Selection, de donde toma también M.Cap, deuda/patrimonio, proyecciones y fondos.

const IS = "Income Statement";
const CF = "Cash Flow";
const METRICS = [
  { metric: "revenue",  section: IS, line: "Revenues" },
  { metric: "ebit",     section: IS, line: "EBIT" },
  { metric: "ebitda",   section: IS, line: "EBITDA" },
  { metric: "utilidad", section: IS, line: "Controlling Net Income" },
  { metric: "capex",    section: CF, line: "PP&E Capex" },
] as const;
const TAX = { section: IS, line: "Tax Rate for ROIC" };

export type ResumenMetric = (typeof METRICS)[number]["metric"];

export interface ResumenFlow {
  ltm: number | null;     ltmPrev: number | null;   // 12 meses a n y a n-4
  ytd: number | null;     ytdPrev: number | null;   // acumulado del año y el mismo período del año anterior
  q: number | null;       qPrev: number | null;     // trimestre n y n-4
}
export interface ResumenCompany {
  ticker: string;          // normBBG ("ANDINAB CI"), el mismo que SsV1Company.fichaTicker
  fullTicker: string;      // tal como está en la ficha ("ANDINAB CI EQUITY")
  currency: "CLP" | "USD";
  taxRate: number | null;  // "Tax Rate for ROIC" (decimal) del trimestre n
  flows: Record<ResumenMetric, ResumenFlow>;
}
export interface ResumenPending { ticker: string; fullTicker: string; lastLabel: string }
export interface ResumenPayload {
  fy: number; q: number;
  label: string;           // "3Q 2026"
  labels: { ltm: string; ltmPrev: string; ytd: string; ytdPrev: string; q: string; qPrev: string };
  fx: number | null;       // FX de las fichas del trimestre (CLP por USD): TC por defecto
  companies: ResumenCompany[];
  pending: ResumenPending[];
  // EBIT proyectado del último modelo, por ticker del modelo (normBBG), SIN escalar: el front
  // lo multiplica por SsV1Company.modelScale, que ya mide la escala del modelo.
  modelEbit: Record<string, { y26: number | null; y27: number | null }>;
}

const short = (fy: number, q: number) => `${q}Q${String(fy).slice(2)}`;

interface Series { A: Map<number, number>; Q: Map<number, number>; L: Map<number, number>; Y: Map<number, number> }
const emptySeries = (): Series => ({ A: new Map(), Q: new Map(), L: new Map(), Y: new Map() });

export async function GET(request: NextRequest) {
  try {
    const [rows, picks] = await Promise.all([
      prisma.fichaStatement.findMany({
        where: { OR: [...METRICS, TAX].map(({ section, line }) => ({ section, line })) },
        select: { ticker: true, currency: true, fx: true, periodType: true, year: true, quarter: true, section: true, line: true, value: true },
      }),
      loadModelPicks([2026, 2027]),
    ]);

    const metricOf = new Map<string, string>(METRICS.map((m) => [`${m.section}|${m.line}`, m.metric]));
    interface Co { fullTicker: string; currency: "CLP" | "USD"; m: Map<string, Series>; lastQ: number }
    const byTicker = new Map<string, Co>();
    for (const r of rows) {
      const k = normBBG(r.ticker);
      if (!k) continue;
      let co = byTicker.get(k);
      if (!co) { co = { fullTicker: r.ticker, currency: r.currency === "USD" ? "USD" : "CLP", m: new Map(), lastQ: 0 }; byTicker.set(k, co); }
      const metric = r.section === TAX.section && r.line === TAX.line ? "tax" : metricOf.get(`${r.section}|${r.line}`);
      if (!metric) continue;
      let s = co.m.get(metric);
      if (!s) { s = emptySeries(); co.m.set(metric, s); }
      const v = Number(r.value);
      const key = qKey(r.year, r.quarter);
      if (r.periodType === "A") s.A.set(r.year, v);
      else if (r.periodType === "Q") { s.Q.set(key, v); if (metric !== "tax" && key > co.lastQ) co.lastQ = key; }
      else if (r.periodType === "L") s.L.set(key, v);
      else if (r.periodType === "Y") s.Y.set(key, v);
    }

    // Trimestre vigente: el más reciente de todas las fichas (o el pedido con ?fy=&q=).
    let nKey = Math.max(0, ...[...byTicker.values()].map((c) => c.lastQ));
    const fyP = parseInt(request.nextUrl.searchParams.get("fy") ?? "", 10);
    const qP = parseInt(request.nextUrl.searchParams.get("q") ?? "", 10);
    if (Number.isFinite(fyP) && qP >= 1 && qP <= 4) nKey = qKey(fyP, qP);
    const fy = Math.floor(nKey / 10), q = nKey % 10;
    const prevKey = qKey(fy - 1, q);

    // Trimestre suelto; si falta el 4Q se despeja del año (A − 1Q − 2Q − 3Q).
    const qVal = (s: Series, key: number): number | null => {
      const v = s.Q.get(key);
      if (v != null) return v;
      const y = Math.floor(key / 10);
      if (key % 10 !== 4 || !s.A.has(y)) return null;
      let acc = s.A.get(y)!;
      for (let i = 1; i <= 3; i++) { const x = s.Q.get(qKey(y, i)); if (x == null) return null; acc -= x; }
      return acc;
    };
    // Suma estricta de `count` trimestres hasta `key`: si falta uno, null (no se compara 9 meses contra 12).
    const sumBack = (s: Series, key: number, count: number): number | null => {
      let y = Math.floor(key / 10), qq = key % 10, acc = 0;
      for (let i = 0; i < count; i++) {
        const v = qVal(s, qKey(y, qq));
        if (v == null) return null;
        acc += v;
        if (--qq === 0) { qq = 4; y--; }
      }
      return acc;
    };
    // LTM: la columna LTM de la ficha si es de ese trimestre; al 4Q, el año; si no, 4 trimestres.
    const ltmAt = (s: Series, key: number): number | null =>
      s.L.get(key) ?? (key % 10 === 4 ? s.A.get(Math.floor(key / 10)) : undefined) ?? sumBack(s, key, 4);
    // Acumulado: la columna Acumulado de la ficha; al 4Q, el año; si no, 1Q..q.
    const ytdAt = (s: Series, key: number): number | null =>
      s.Y.get(key) ?? (key % 10 === 4 ? s.A.get(Math.floor(key / 10)) : undefined) ?? sumBack(s, key, key % 10);

    const companies: ResumenCompany[] = [];
    const pending: ResumenPending[] = [];
    const fxCount = new Map<number, number>();
    for (const [ticker, co] of byTicker) {
      if (co.lastQ < nKey) {
        if (co.lastQ) pending.push({ ticker, fullTicker: co.fullTicker, lastLabel: `${co.lastQ % 10}Q ${Math.floor(co.lastQ / 10)}` });
        continue;
      }
      // Reportó el trimestre: alguna línea de flujo tiene el trimestre n.
      if (![...co.m.entries()].some(([m, s]) => m !== "tax" && s.Q.has(nKey))) continue;
      const flows = {} as Record<ResumenMetric, ResumenFlow>;
      for (const { metric } of METRICS) {
        const s = co.m.get(metric);
        flows[metric] = s
          ? { ltm: ltmAt(s, nKey), ltmPrev: ltmAt(s, prevKey), ytd: ytdAt(s, nKey), ytdPrev: ytdAt(s, prevKey), q: qVal(s, nKey), qPrev: qVal(s, prevKey) }
          : { ltm: null, ltmPrev: null, ytd: null, ytdPrev: null, q: null, qPrev: null };
      }
      const tax = co.m.get("tax");
      companies.push({
        ticker, fullTicker: co.fullTicker, currency: co.currency,
        taxRate: tax ? tax.Q.get(nKey) ?? tax.L.get(nKey) ?? null : null,
        flows,
      });
    }
    // FX de las fichas del trimestre: el más repetido (todas las de una subida comparten la celda C6).
    for (const r of rows) {
      if (r.periodType !== "Q" || qKey(r.year, r.quarter) !== nKey) continue;
      const fx = Number(r.fx);
      if (fx > 0) fxCount.set(fx, (fxCount.get(fx) ?? 0) + 1);
    }
    const fx = [...fxCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    const modelEbit: ResumenPayload["modelEbit"] = {};
    for (const [t, p] of picks) modelEbit[t] = { y26: p.years.get(2026)?.ebit ?? null, y27: p.years.get(2027)?.ebit ?? null };

    const months = q * 3;
    const payload: ResumenPayload = {
      fy, q, label: `${q}Q ${fy}`,
      labels: {
        ltm: `LTM ${short(fy, q)}`, ltmPrev: `LTM ${short(fy - 1, q)}`,
        ytd: q === 4 ? `FY ${fy}` : `${months}M ${fy}`, ytdPrev: q === 4 ? `FY ${fy - 1}` : `${months}M ${fy - 1}`,
        q: short(fy, q), qPrev: short(fy - 1, q),
      },
      fx, companies, pending: pending.sort((a, b) => a.ticker.localeCompare(b.ticker)), modelEbit,
    };
    return NextResponse.json(payload);
  } catch (e) {
    console.error("[resumen-resultados]", e);
    return NextResponse.json({ error: "Internal server error", details: String(e) }, { status: 500 });
  }
}
