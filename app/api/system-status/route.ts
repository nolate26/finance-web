import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Semáforo de frescura de los datos.
//
// Las filas se organizan por SECCIÓN DEL NAVBAR, no por tabla: al analista le sirve
// saber "lo que veo en Analyst Estimates es de tal fecha", no el nombre de la tabla.
// La tabla igual viaja en `source` para poder auditar de dónde salió el número.
//
// Hay dos ámbitos:
//   · global          — el modal que se abre al entrar a la plataforma.
//   · stock-selection — la alerta propia de Chile → Stock Selection, que corre con
//                       fuentes distintas al resto de la app (ver abajo).

export interface FreshnessItem {
  key:     string;
  /** Sección del navbar a la que pertenece la fila. */
  section: string;
  label:   string;
  /** Tabla(s) consultadas — visible en el modal para que el dato sea auditable. */
  source:  string;
  date:    string | null;   // ISO YYYY-MM-DD
  ageDays: number | null;
  status:  "fresh" | "warn" | "stale" | "unknown";
}

export interface SystemStatusPayload {
  scope:     string;
  items:     FreshnessItem[];
  checkedAt: string;
}

/**
 * Umbrales por fuente, en días: `warn` al pasar el primero, `stale` al pasar el
 * segundo. Salen de la cadencia REAL medida en la base, no de un supuesto.
 */
const THRESHOLDS: Record<string, { warn: number; stale: number }> = {
  marketBatch: { warn: 14, stale: 30 },   // lote Bloomberg de mercado (semanal)
  consensus:   { warn: 14, stale: 30 },   // valuación + consenso (semanal)
  funds:       { warn: 14, stale: 30 },   // pesos de cartera (semanal)
  ssPrices:    { warn: 3,  stale: 7  },   // snapshot de retornos (diario)
  ssEstimates: { warn: 45, stale: 90 },   // proyecciones (sin periodicidad fija)
};

const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

const daysSince = (d: Date | null | undefined) =>
  d ? Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000)) : null;

function statusOf(threshold: string, age: number | null): FreshnessItem["status"] {
  if (age === null) return "unknown";
  const t = THRESHOLDS[threshold];
  if (!t) return "fresh";
  if (age > t.stale) return "stale";
  if (age > t.warn)  return "warn";
  return "fresh";
}

function item(
  key: string, section: string, label: string, source: string,
  date: Date | null, threshold: string,
): FreshnessItem {
  const ageDays = daysSince(date);
  return { key, section, label, source, date: iso(date), ageDays, status: statusOf(threshold, ageDays) };
}

// ── Ámbito global: lo que se ve al entrar a la plataforma ─────────────────────
async function buildGlobal(): Promise<FreshnessItem[]> {
  const [marketPrices, marketBatch, multiples, consensus, funds] = await Promise.all([
    // El precio que muestran TANTO Analyst Estimates (badge "Prices as of") COMO la
    // ficha de Company Info sale de la misma tabla: price_range_52w. Aparece bajo las
    // dos secciones a propósito — el analista pregunta por sección, no por tabla.
    prisma.priceRange52w.aggregate({ _max: { date: true } }),

    // Market Data: PeHistorico, PeSummarySnapshot, EquityCompsSnapshot, MacroHistorico
    // y CommodityHistorico se cargan en el MISMO lote (las cinco marcan idéntica fecha
    // en la base), así que basta una para fechar la sección entera.
    prisma.equityCompsSnapshot.aggregate({ _max: { snapshotDate: true } }),

    // Company Info · múltiplos históricos (semanal, viernes).
    prisma.valuationHistory.aggregate({ _max: { date: true } }),
    // Company Info · estimaciones de consenso. Va aparte: hoy las dos tablas difieren
    // en semanas y se reporta la MÁS ATRASADA, que es la que limita el análisis.
    prisma.consensusEstimate.aggregate({ _max: { date: true } }),

    // Moneda Funds · pesos de cartera.
    prisma.fundPortfolioWeight.aggregate({ _max: { reportDate: true } }),
  ]);

  const priceDate = marketPrices._max.date ?? null;
  const mDate = multiples._max.date ?? null;
  const cDate = consensus._max.date ?? null;
  const consensusDate = mDate && cDate ? (mDate < cDate ? mDate : cDate) : (mDate ?? cDate);

  return [
    item("estimates-price", "Analyst Estimates", "Last price used",
         "price_range_52w", priceDate, "marketBatch"),

    item("market-data", "Market Data", "Indices, comps & commodities",
         "EquityCompsSnapshot · PeHistorico · MacroHistorico",
         marketBatch._max.snapshotDate ?? null, "marketBatch"),

    item("funds", "Moneda Funds", "Portfolio weights",
         "fund_portfolio_weights", funds._max.reportDate ?? null, "funds"),

    item("company-consensus", "Company Info", "Bloomberg consensus & multiples",
         "valuation_history · consensus_estimates", consensusDate, "consensus"),

    item("company-price", "Company Info", "Last price used",
         "price_range_52w", priceDate, "marketBatch"),
  ];
}

// ── Ámbito Stock Selection (Chile) ────────────────────────────────────────────
// Stock Selection no se alimenta del lote de mercado del resto de la app: los precios
// y retornos vienen del snapshot de Bloomberg (diario) y las proyecciones del Excel
// del analista. Por eso tiene alerta propia en vez de mezclarse en el modal global.
async function buildStockSelection(): Promise<FreshnessItem[]> {
  const [prices, estimates] = await Promise.all([
    prisma.tickerReturnSnapshot.aggregate({ _max: { asOf: true } }),
    prisma.proyecciones_financieras.aggregate({ _max: { generated_at: true } }),
  ]);

  return [
    item("ss-prices", "Stock Selection", "Market prices & returns",
         "ticker_return_snapshot", prices._max.asOf ?? null, "ssPrices"),

    item("ss-estimates", "Stock Selection", "Moneda analyst estimates",
         "proyecciones_financieras", estimates._max.generated_at ?? null, "ssEstimates"),
  ];
}

export async function GET(req: NextRequest) {
  const deny = await requireAuth();
  if (deny) return deny;

  const scope = new URL(req.url).searchParams.get("scope") === "stock-selection"
    ? "stock-selection"
    : "global";

  try {
    const items = scope === "stock-selection" ? await buildStockSelection() : await buildGlobal();
    return NextResponse.json({
      scope,
      items,
      checkedAt: new Date().toISOString(),
    } satisfies SystemStatusPayload);
  } catch (e) {
    console.error("[system-status]", e);
    return NextResponse.json({ error: "No se pudo leer el estado del sistema" }, { status: 500 });
  }
}
