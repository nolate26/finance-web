import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { normalizeTicker } from '@/lib/issuer';
import { missingFromMaster, masterMissingMessage } from '@/lib/masterTickers';

// Ingest de la hoja "Send Ficha" (macro SubirFicha). Mismo criterio que /api/ingest:
// sin sesión (la macro no manda cookie; la ruta queda fuera del matcher del middleware).
//
// Body: { statements: [{ ticker, currency, fx, periodType, year, quarter, periodEnd,
//                        section, line, lineOrder, value }],
//         kpis:       [{ ...mismo período, section, kpi, kpiOrder, value }] }
//
// Siempre UPSERT por la clave única: reenviar la misma planilla pisa valores, no duplica,
// y lo que dejó de venir NO se borra. Todo en una transacción: o entra todo o nada.

const SECTIONS = ['Income Statement', 'Balance Sheet', 'Cash Flow'] as const;

// ~1.500 filas por request → un INSERT … ON CONFLICT por lote, no un upsert por fila.
// 500 filas × 11 parámetros queda muy lejos del límite de 65.535 de Postgres.
const BATCH = 500;

// Topes de las columnas DECIMAL(24,6) y DECIMAL(18,6): pasarse es un "numeric field
// overflow" de Postgres (500); mejor rechazarlo antes con un 400 que diga qué fila es.
const MAX_ABS_VALUE = 1e18;
const MAX_ABS_FX = 1e12;

const reqString = (field: string, max: number) =>
  z.string({ required_error: `${field} es obligatorio`, invalid_type_error: `${field} debe ser texto` })
    .trim()
    .min(1, `${field} es obligatorio`)
    .max(max, `${field} supera ${max} caracteres`);

const reqNumber = (field: string, maxAbs: number) =>
  z.number({ required_error: `${field} es obligatorio`, invalid_type_error: `${field} debe ser numérico` })
    .finite(`${field} debe ser numérico`)
    .refine((v) => Math.abs(v) < maxAbs, `${field} fuera de rango (|${field}| < ${maxAbs})`);

const reqInt = (field: string) =>
  z.number({ required_error: `${field} es obligatorio`, invalid_type_error: `${field} debe ser numérico` })
    .int(`${field} debe ser entero`);

const periodEnd = z
  .string({ required_error: 'periodEnd es obligatorio', invalid_type_error: 'periodEnd debe ser texto yyyy-mm-dd' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'periodEnd debe tener formato yyyy-mm-dd')
  // "2026-02-30" pasa el regex pero no es una fecha: se compara contra su propio round-trip.
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'periodEnd no es una fecha válida');

// Campos de período comunes a statements y kpis. Ticker canónico (MAYÚSCULA, espacios
// colapsados) como el resto de las tablas del deep-dive: las lecturas son exact-match.
const periodFields = {
  ticker:     reqString('ticker', 100).transform(normalizeTicker),
  currency:   reqString('currency', 10).transform((s) => s.toUpperCase()),
  fx:         reqNumber('fx', MAX_ABS_FX),
  periodType: z.enum(['A', 'Q', 'L', 'Y'], { errorMap: () => ({ message: 'periodType debe ser "A" (anual), "Q" (trimestre), "L" (LTM) o "Y" (acumulado)' }) }),
  year:       reqInt('year').min(1900, 'year fuera de rango').max(2100, 'year fuera de rango'),
  quarter:    reqInt('quarter'),
  periodEnd,
};

// "L" = columna LTM de la hoja: year/quarter son los del último trimestre (LTM a 3Q26 →
// year 2026, quarter 3) y dicen a qué fecha está. Hay UNO por compañía (ver POST).
// "Y" = columnas "Acumulado" (year 2026, quarter 3 = 9M26) y "Acumulado n-1" (year 2025,
// quarter 3 = 9M25): un solo par por compañía, igual que el LTM.
function checkQuarter(r: { periodType: 'A' | 'Q' | 'L' | 'Y'; quarter: number }, ctx: z.RefinementCtx) {
  if (r.periodType === 'A' && r.quarter !== 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['quarter'], message: `quarter debe ser 0 cuando periodType es "A" (llegó ${r.quarter})` });
  }
  if (r.periodType !== 'A' && (r.quarter < 1 || r.quarter > 4)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['quarter'], message: `quarter debe ser 1 a 4 cuando periodType es "${r.periodType}" (llegó ${r.quarter})` });
  }
}

// Case sensitive: tiene que llegar exactamente con esta grafía (la macro la canoniza).
const section = z.enum(SECTIONS, {
  errorMap: (issue, ctx) => ({
    message: `section debe ser exactamente ${SECTIONS.map((x) => `"${x}"`).join(', ')}` +
      (issue.code === z.ZodIssueCode.invalid_enum_value ? ` (llegó "${issue.received}")` : ''),
  }),
});

// 240 y no 255: deja lugar al sufijo " (n)" de disambiguate().
const statementSchema = z
  .object({
    ...periodFields,
    section,
    line:      reqString('line', 240),
    lineOrder: reqInt('lineOrder'),
    value:     reqNumber('value', MAX_ABS_VALUE),
  })
  .superRefine(checkQuarter);

const kpiSchema = z
  .object({
    ...periodFields,
    // Subtítulo del bloque KPIs. Vacío = la hoja tiene KPIs antes del primer subtítulo.
    section:  reqString('section (subtítulo del bloque KPIs)', 255),
    kpi:      reqString('kpi', 240),
    kpiOrder: reqInt('kpiOrder'),
    value:    reqNumber('value', MAX_ABS_VALUE),
  })
  .superRefine(checkQuarter);

const bodySchema = z
  .object({
    statements: z.array(statementSchema, { invalid_type_error: 'statements debe ser un array' }).default([]),
    kpis:       z.array(kpiSchema, { invalid_type_error: 'kpis debe ser un array' }).default([]),
  })
  .refine((b) => b.statements.length + b.kpis.length > 0, 'El body no trae filas en statements ni en kpis');

type StatementRow = z.infer<typeof statementSchema>;
type KpiRow = z.infer<typeof kpiSchema>;

// ["statements", 12, "quarter"] → "statements[12].quarter: <mensaje>". Con ~1.500 filas
// un error de la macro se repite en cientos: se muestran los primeros 10 y el total.
function formatIssues(err: z.ZodError): string {
  const path = (p: (string | number)[]) =>
    p.map((s, i) => (typeof s === 'number' ? `[${s}]` : i ? `.${s}` : s)).join('');
  const shown = err.issues.slice(0, 10).map((i) => (i.path.length ? `${path(i.path)}: ${i.message}` : i.message));
  const more = err.issues.length - shown.length;
  return shown.join(' | ') + (more > 0 ? ` | … y ${more} errores más` : '');
}

// Nombres repetidos dentro de una sección (el típico "Var %" de los KPIs): la clave única
// no incluye el orden, así que dos filas distintas chocarían y una pisaría a la otra.
// Se numeran por orden en la planilla — 1ª igual, 2ª " (2)", 3ª " (3)" — igual que hace la
// macro con las líneas de los estados. Es determinista: reenviar la hoja da los mismos nombres.
function disambiguate<T extends { ticker: string; section: string }>(
  rows: T[],
  name: (r: T) => string,
  order: (r: T) => number,
  rename: (r: T, n: string) => T,
): T[] {
  const orders = new Map<string, Set<number>>();
  for (const r of rows) {
    const k = `${r.ticker}|${r.section}|${name(r)}`;
    if (!orders.has(k)) orders.set(k, new Set());
    orders.get(k)!.add(order(r));
  }
  const rank = new Map<string, Map<number, number>>();
  for (const [k, set] of orders) {
    if (set.size > 1) rank.set(k, new Map([...set].sort((a, b) => a - b).map((o, i) => [o, i + 1])));
  }
  if (rank.size === 0) return rows;
  return rows.map((r) => {
    const n = rank.get(`${r.ticker}|${r.section}|${name(r)}`)?.get(order(r));
    return n && n > 1 ? rename(r, `${name(r)} (${n})`) : r;
  });
}

// Misma clave dos veces en un INSERT … ON CONFLICT revienta ("cannot affect row a second
// time"): replica el "último gana" de un upsert fila a fila.
function dedupeBy<T>(rows: T[], key: (r: T) => string): T[] {
  const map = new Map<string, T>();
  for (const r of rows) map.set(key(r), r);
  return [...map.values()];
}

// Los montos viajan como texto + ::numeric para que Postgres los parsee exactos
// (String(1e-7) = "1e-7" lo acepta numeric).
async function upsertStatements(tx: Prisma.TransactionClient, rows: StatementRow[]) {
  for (let i = 0; i < rows.length; i += BATCH) {
    const values = rows.slice(i, i + BATCH).map((r) => Prisma.sql`(
      ${r.ticker}, ${r.currency}, ${String(r.fx)}::numeric, ${r.periodType}, ${r.year}::int, ${r.quarter}::int,
      ${r.periodEnd}::date, ${r.section}, ${r.line}, ${r.lineOrder}::int, ${String(r.value)}::numeric, now()
    )`);
    await tx.$executeRaw`
      INSERT INTO ficha_statements
        (ticker, currency, fx, period_type, year, quarter, period_end, section, line, line_order, value, updated_at)
      VALUES ${Prisma.join(values)}
      ON CONFLICT (ticker, period_type, year, quarter, section, line) DO UPDATE SET
        value      = EXCLUDED.value,
        line_order = EXCLUDED.line_order,
        currency   = EXCLUDED.currency,
        fx         = EXCLUDED.fx,
        period_end = EXCLUDED.period_end,
        updated_at = now()`;
  }
}

async function upsertKpis(tx: Prisma.TransactionClient, rows: KpiRow[]) {
  for (let i = 0; i < rows.length; i += BATCH) {
    const values = rows.slice(i, i + BATCH).map((r) => Prisma.sql`(
      ${r.ticker}, ${r.currency}, ${String(r.fx)}::numeric, ${r.periodType}, ${r.year}::int, ${r.quarter}::int,
      ${r.periodEnd}::date, ${r.section}, ${r.kpi}, ${r.kpiOrder}::int, ${String(r.value)}::numeric, now()
    )`);
    await tx.$executeRaw`
      INSERT INTO ficha_kpis
        (ticker, currency, fx, period_type, year, quarter, period_end, section, kpi, kpi_order, value, updated_at)
      VALUES ${Prisma.join(values)}
      ON CONFLICT (ticker, period_type, year, quarter, section, kpi) DO UPDATE SET
        value      = EXCLUDED.value,
        kpi_order  = EXCLUDED.kpi_order,
        currency   = EXCLUDED.currency,
        fx         = EXCLUDED.fx,
        period_end = EXCLUDED.period_end,
        updated_at = now()`;
  }
}

export async function POST(request: Request) {
  try {
    let data: unknown;
    try {
      data = await request.json();
    } catch {
      // Causa típica desde VBA: Str(0.5) devuelve " .5" → ".5" no es JSON válido.
      return NextResponse.json(
        { error: 'Payload inválido: el body no es JSON válido (¿números como ".5" sin el 0 inicial?)' },
        { status: 400 },
      );
    }

    const parsed = bodySchema.safeParse(data);
    if (!parsed.success) {
      return NextResponse.json({ error: `Payload inválido: ${formatIssues(parsed.error)}` }, { status: 400 });
    }

    const periodKey = (r: { ticker: string; periodType: string; year: number; quarter: number; section: string }) =>
      `${r.ticker}|${r.periodType}|${r.year}|${r.quarter}|${r.section}`;

    const statements = dedupeBy(
      disambiguate(parsed.data.statements, (r) => r.line, (r) => r.lineOrder, (r, line) => ({ ...r, line })),
      (r) => `${periodKey(r)}|${r.line}`,
    );
    const kpis = dedupeBy(
      disambiguate(parsed.data.kpis, (r) => r.kpi, (r) => r.kpiOrder, (r, kpi) => ({ ...r, kpi })),
      (r) => `${periodKey(r)}|${r.kpi}`,
    );

    // FK a la maestra (B6): se valida antes de escribir. Sin esto la transacción cae a mitad
    // de camino con el error crudo de Postgres y la macro sólo ve un 500.
    const missing = await missingFromMaster([...statements, ...kpis].map((r) => r.ticker));
    if (missing.length) {
      return NextResponse.json({ error: masterMissingMessage(missing) }, { status: 400 });
    }

    // LTM y acumulados: uno solo por compañía. Si la planilla trae esas columnas, se borran
    // las anteriores (de cualquier trimestre) y quedan las que llegan; así tampoco sobreviven
    // líneas renombradas.
    const replaced = (['L', 'Y'] as const)
      .map((t) => ({ t, tickers: [...new Set([...statements, ...kpis].filter((r) => r.periodType === t).map((r) => r.ticker))] }))
      .filter((x) => x.tickers.length);

    await prisma.$transaction(async (tx) => {
      for (const { t, tickers } of replaced) {
        await tx.$executeRaw`DELETE FROM ficha_statements WHERE period_type = ${t} AND ticker IN (${Prisma.join(tickers)})`;
        await tx.$executeRaw`DELETE FROM ficha_kpis WHERE period_type = ${t} AND ticker IN (${Prisma.join(tickers)})`;
      }
      await upsertStatements(tx, statements);
      await upsertKpis(tx, kpis);
    }, { timeout: 20_000 });

    return NextResponse.json({ statements: statements.length, kpis: kpis.length });
  } catch (error) {
    console.error('Error en API [FichaIngest]:', error);
    return NextResponse.json({ error: 'Error interno del servidor', details: String(error) }, { status: 500 });
  }
}
