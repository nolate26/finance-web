import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// ---------------------------------------------------------------------------
// CSV utility
// ---------------------------------------------------------------------------

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // Wrap in quotes if it contains comma, newline, or double-quote
  if (str.includes(',') || str.includes('\n') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function jsonToCsv(data: Record<string, unknown>[]): string {
  if (data.length === 0) return '';
  const headers = Object.keys(data[0]);
  const rows = data.map((row) => headers.map((h) => escapeCell(row[h])).join(','));
  return [headers.join(','), ...rows].join('\n');
}

// ---------------------------------------------------------------------------
// Pivot helpers  (Long → Wide)
// ---------------------------------------------------------------------------

/** Generic pivot: rows keyed by dateStr, columns keyed by colKey. */
function pivotLongToWide(
  records: { date: Date; colKey: string; value: number | null }[]
): Record<string, unknown>[] {
  // Collect all unique column keys, preserving insertion order (already date-sorted)
  const colSet = new Set<string>();
  for (const r of records) colSet.add(r.colKey);
  const cols = Array.from(colSet);

  // Build a map: dateStr → { date, col1, col2, … }
  const rowMap = new Map<string, Record<string, unknown>>();
  for (const r of records) {
    const dateStr = r.date.toISOString().slice(0, 10); // YYYY-MM-DD
    if (!rowMap.has(dateStr)) {
      const base: Record<string, unknown> = { date: dateStr };
      for (const c of cols) base[c] = null;
      rowMap.set(dateStr, base);
    }
    rowMap.get(dateStr)![r.colKey] = r.value;
  }

  return Array.from(rowMap.values());
}

// ---------------------------------------------------------------------------
// Report handlers
// ---------------------------------------------------------------------------

async function exportPeHistorico(): Promise<Record<string, unknown>[]> {
  const rows = await prisma.peHistorico.findMany({ orderBy: { date: 'asc' } });
  const mapped = rows.map((r) => ({ date: r.date, colKey: r.indice, value: r.peValue }));
  return pivotLongToWide(mapped);
}

async function exportCommoditiesHistorico(): Promise<Record<string, unknown>[]> {
  const rows = await prisma.commodityHistorico.findMany({ orderBy: { date: 'asc' } });
  const mapped = rows.map((r) => ({ date: r.date, colKey: r.commodity, value: r.precio }));
  return pivotLongToWide(mapped);
}

async function exportMacroHistorico(): Promise<Record<string, unknown>[]> {
  const rows = await prisma.macroHistorico.findMany({ orderBy: { date: 'asc' } });
  // Column key = "País - Indicador"
  const mapped = rows.map((r) => ({
    date: r.date,
    colKey: `${r.pais} - ${r.indicador}`,
    value: r.valor,
  }));
  return pivotLongToWide(mapped);
}

/** Returns only rows from the latest snapshotDate. Strips id & snapshotDate. */
async function latestSnapshot<T extends { id: number; snapshotDate: Date }>(
  model: {
    findFirst: (args: {
      orderBy: { snapshotDate: 'desc' };
      select: { snapshotDate: true };
    }) => Promise<{ snapshotDate: Date } | null>;
    findMany: (args: { where: { snapshotDate: Date }; orderBy: { id: 'asc' } }) => Promise<T[]>;
  }
): Promise<Record<string, unknown>[]> {
  const latest = await model.findFirst({
    orderBy: { snapshotDate: 'desc' },
    select: { snapshotDate: true },
  });
  if (!latest) return [];

  const rows = await model.findMany({
    where: { snapshotDate: latest.snapshotDate },
    orderBy: { id: 'asc' },
  });

  // Remove internal fields and format snapshotDate
  return rows.map(({ id: _id, snapshotDate, ...rest }) => ({
    snapshotDate: snapshotDate.toISOString().slice(0, 10),
    ...rest,
  }));
}

// ---------------------------------------------------------------------------
// Route config
// ---------------------------------------------------------------------------

type ReportKey =
  | 'pe-historico'
  | 'commodities-historico'
  | 'macro-historico'
  | 'pe-resumen'
  | 'comps-maestra'
  | 'macro-forecasts'
  | 'commodities-proyecciones';

const REPORT_HANDLERS: Record<ReportKey, () => Promise<Record<string, unknown>[]>> = {
  'pe-historico': exportPeHistorico,
  'commodities-historico': exportCommoditiesHistorico,
  'macro-historico': exportMacroHistorico,
  'pe-resumen': () => latestSnapshot(prisma.peSummarySnapshot as never),
  'comps-maestra': () => latestSnapshot(prisma.equityCompsSnapshot as never),
  'macro-forecasts': () => latestSnapshot(prisma.macroForecasts as never),
  'commodities-proyecciones': () => latestSnapshot(prisma.commodityForecasts as never),
};

function isReportKey(key: string): key is ReportKey {
  return key in REPORT_HANDLERS;
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ report: string }> }
) {
  const { report } = await params;

  if (!isReportKey(report)) {
    return NextResponse.json(
      { error: `Reporte "${report}" no reconocido. Reportes válidos: ${Object.keys(REPORT_HANDLERS).join(', ')}` },
      { status: 404 }
    );
  }

  try {
    const data = await REPORT_HANDLERS[report]();

    if (data.length === 0) {
      return NextResponse.json(
        { error: `Sin datos disponibles para el reporte "${report}"` },
        { status: 404 }
      );
    }

    const csv = jsonToCsv(data);
    const dateTag = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const filename = `${report}_${dateTag}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error(`[export/${report}] Error:`, error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
