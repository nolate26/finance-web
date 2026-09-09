import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Semáforo de frescura de los datos.
//
// Deliberadamente CORTO: tres líneas en el modal global. Una versión anterior agrupaba
// por sección del navbar y mostraba la tabla de origen debajo de cada fila; era exacta
// pero ilegible para quien sólo quiere saber si los números están al día. El nombre de
// la tabla vive ahora sólo acá, en los comentarios de cada consulta.
//
// Hay dos ámbitos:
//   · global          — el modal que se abre al entrar a la plataforma.
//   · stock-selection — la alerta propia de Chile → Stock Selection, que corre con
//                       fuentes distintas al resto de la app (ver abajo).

export interface FreshnessItem {
  key:     string;
  label:   string;
  /** Línea secundaria opcional: quién actualiza el dato. No es el nombre de la tabla. */
  note:    string | null;
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
  key: string, label: string, note: string | null,
  date: Date | null, threshold: string,
): FreshnessItem {
  const ageDays = daysSince(date);
  return { key, label, note, date: iso(date), ageDays, status: statusOf(threshold, ageDays) };
}

// ── Ámbito global: lo que se ve al entrar a la plataforma ─────────────────────
async function buildGlobal(): Promise<FreshnessItem[]> {
  const [prices, multiples, consensus, funds] = await Promise.all([
    // PRICES — price_range_52w. Es el precio que muestran tanto Analyst Estimates
    // (badge "Prices as of") como la ficha de Company Info, y viaja en el mismo lote
    // que las tablas de Market Data (las seis marcan idéntica fecha en la base), así
    // que una sola línea fecha correctamente todo el mercado.
    prisma.priceRange52w.aggregate({ _max: { date: true } }),

    // BBG DATA — múltiplos históricos (semanal, viernes)…
    prisma.valuationHistory.aggregate({ _max: { date: true } }),
    // …y estimaciones de consenso. Van por separado porque se cargan por separado y
    // hoy difieren en semanas: se reporta la MÁS ATRASADA, que es la que manda.
    prisma.consensusEstimate.aggregate({ _max: { date: true } }),

    // MONEDA FUNDS — pesos de cartera, que carga Business Intelligence.
    prisma.fundPortfolioWeight.aggregate({ _max: { reportDate: true } }),
  ]);

  const mDate = multiples._max.date ?? null;
  const cDate = consensus._max.date ?? null;
  const bbgDate = mDate && cDate ? (mDate < cDate ? mDate : cDate) : (mDate ?? cDate);

  return [
    item("prices", "Prices", null,
         prices._max.date ?? null, "marketBatch"),

    item("bbg", "BBG data", null,
         bbgDate, "consensus"),

    item("funds", "Moneda Funds", "Updated by Business Intelligence",
         funds._max.reportDate ?? null, "funds"),
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
    // ticker_return_snapshot — snapshot diario de Bloomberg.
    item("ss-prices", "Prices", null,
         prices._max.asOf ?? null, "ssPrices"),

    // proyecciones_financieras — el Excel del analista.
    item("ss-estimates", "Moneda analyst estimates", null,
         estimates._max.generated_at ?? null, "ssEstimates"),
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
