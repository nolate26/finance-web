import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Fuente: moneda_fund_returns, cargada desde el Excel de rentabilidades (una fila por
// fondo/índice y FAMILIA). Cada vista de /fondos pide una familia
// (?familia=Chilean%20Equities%20SC) y recibe la tabla del último informe + la serie YTD
// del año. Cada familia trae sus propios benchmarks (IPSA en Chilean Equities LC,
// Ibovespa en Brazil Long Only…), así que no hace falta pedir filas de otra tabla.

export interface RentabilidadRow {
  fund: string;
  manager: string;
  /** SUBFAMILIA tal cual viene del Excel: "Moneda Funds", "Peer Group (Large Cap)", "Indices", "Currencies". */
  group: string;
  currency: string;
  nav: number | null;
  mtd: number | null;
  ytd: number | null;
  oneYear: number | null;
  twoYears: number | null;
  threeYears: number | null;
  fiveYears: number | null;
  tenYears: number | null;
  aum: number | null;
  sharpe: number | null;
  mgmtFee: number | null;
  /** SINCE INCEPTION 1: acumulado desde el inicio de referencia 1 de la familia. */
  si1Cum: number | null;
  /** ANUALIZADO SINCE INCEPTION 1. */
  si1Ann: number | null;
  /** ANUALIZADO SINCE INCEPTION 2 (segundo inicio de referencia, p.ej. Orange en Chilean Equities LC). */
  si2Ann: number | null;
  sigma: number | null;
  alpha: number | null;
  beta: number | null;
  isMoneda: boolean;
}

export interface FundMeta {
  group: string;
  isMoneda: boolean;
}

const MONEDA_GROUP = "Moneda Funds";

/** Puntos porcentuales en la BDD (3.5) → decimal para el frontend (0.035). */
function toDec(v: number | null | undefined): number | null {
  return v == null ? null : v / 100;
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** Grupo para el gráfico: Moneda / Peer Group / Indices. Otros (Currencies) no se grafican. */
function chartGroup(subfamilia: string): string | null {
  if (subfamilia === MONEDA_GROUP) return "Moneda";
  if (subfamilia.startsWith("Peer")) return "Peer Group";
  if (subfamilia === "Indices") return "Indices";
  return null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const familia = searchParams.get("familia");

  if (!familia) {
    // Sin familia: sólo la fecha del último informe cargado.
    const last = await prisma.monedaFundReturn.findFirst({
      orderBy: { reportDate: "desc" },
      select: { reportDate: true },
    });
    if (!last) return NextResponse.json({ error: "No returns data found" }, { status: 404 });
    return NextResponse.json({ reportDate: isoDay(last.reportDate) });
  }

  const latest = await prisma.monedaFundReturn.findFirst({
    where: { familia },
    orderBy: { reportDate: "desc" },
    select: { reportDate: true },
  });
  if (!latest) {
    return NextResponse.json({ error: `No returns data found for familia "${familia}"` }, { status: 404 });
  }
  const latestDate = latest.reportDate;
  const reportDate = isoDay(latestDate);

  const dbRows = await prisma.monedaFundReturn.findMany({
    where: { familia, reportDate: latestDate },
    orderBy: { fund: "asc" },
  });

  const rows: RentabilidadRow[] = dbRows.map((r) => {
    const group = r.subfamilia ?? "";
    return {
      fund: r.fund,
      manager: r.manager ?? "",
      group,
      currency: r.currency,
      nav: r.nav,
      mtd: toDec(r.mtd),
      ytd: toDec(r.ytd),
      oneYear: toDec(r.ret1y),
      twoYears: toDec(r.ret2y),
      threeYears: toDec(r.ret3y),
      fiveYears: toDec(r.ret5y),
      tenYears: toDec(r.ret10y),
      aum: r.aumUsdMm,
      sharpe: r.sharpe,
      mgmtFee: toDec(r.mgmtFee),
      si1Cum: toDec(r.si1Cum),
      si1Ann: toDec(r.si1Ann),
      si2Ann: toDec(r.si2Ann),
      sigma: toDec(r.sigma),
      alpha: toDec(r.alpha),
      beta: r.beta,
      isMoneda: group === MONEDA_GROUP,
    };
  });

  // ── Series del gráfico: Moneda + pares + índices de la familia ─────────────
  const fundMeta: Record<string, FundMeta> = {};
  for (const r of rows) {
    const g = chartGroup(r.group);
    if (g) fundMeta[r.fund] = { group: g, isMoneda: r.isMoneda };
  }
  const fundSet = new Set(Object.keys(fundMeta));

  // YTD de cada informe del año del último reporte (varios por semana).
  const yearStart = new Date(Date.UTC(latestDate.getUTCFullYear(), 0, 1));
  const yearRows = await prisma.monedaFundReturn.findMany({
    where: { familia, reportDate: { gte: yearStart, lte: latestDate }, fund: { in: [...fundSet] } },
    select: { reportDate: true, fund: true, ytd: true },
    orderBy: { reportDate: "asc" },
  });

  const dateMap = new Map<string, Record<string, string | number | null>>();
  for (const row of yearRows) {
    const d = isoDay(row.reportDate);
    let point = dateMap.get(d);
    if (!point) {
      point = { date: d };
      for (const f of fundSet) point[f] = null;
      dateMap.set(d, point);
    }
    point[row.fund] = toDec(row.ytd);
  }

  return NextResponse.json({ reportDate, rows, timeseries: [...dateMap.values()], fundMeta });
}
