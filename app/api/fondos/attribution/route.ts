import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export interface AttributionRow {
  security: string;
  fundWeight: number | null;
  benchWeight: number | null;
  activeWeight: number | null;
  allocEffect: number | null;
  selectEffect: number | null;
  totalEffect: number | null;
  deltaWeight: number | null;
  deltaTotalEffect: number | null;
}

export interface HistoryPoint {
  date: string;
  weight: number | null;
  totalEffect: number | null;
}

function toISO(d: Date): string {
  return d.toISOString().split("T")[0];
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const fund = searchParams.get("fund");
  if (!fund) {
    return NextResponse.json({ error: "fund parameter required" }, { status: 400 });
  }

  // ── Get all distinct dates for this fund, ordered chronologically ──────────
  const dateRecords = await prisma.performanceAttribution.findMany({
    where: { fund, rowType: "company" },
    select: { reportDate: true },
    distinct: ["reportDate"],
    orderBy: { reportDate: "asc" },
  });

  if (dateRecords.length === 0) {
    return NextResponse.json({ error: `No attribution data for fund "${fund}"` }, { status: 404 });
  }

  const dates = dateRecords.map((r) => toISO(r.reportDate));
  const latestDateStr = dates[dates.length - 1];
  const prevDateStr = dates.length >= 2 ? dates[dates.length - 2] : null;

  // ── Fetch current and previous period rows in parallel ────────────────────
  const latestDate = new Date(latestDateStr + "T00:00:00");
  const [currentRows, prevRows] = await Promise.all([
    prisma.performanceAttribution.findMany({
      where: { fund, reportDate: latestDate, rowType: "company" },
    }),
    prevDateStr
      ? prisma.performanceAttribution.findMany({
          where: {
            fund,
            reportDate: new Date(prevDateStr + "T00:00:00"),
            rowType: "company",
          },
        })
      : Promise.resolve([]),
  ]);

  // Index prev by security
  const prevMap = new Map(prevRows.map((r) => [r.security, r]));

  // ── Build currentPeriod ───────────────────────────────────────────────────
  const currentPeriod: AttributionRow[] = currentRows.map((r) => {
    const fundWeight = r.fundAvgWeight ?? null;
    const benchWeight = r.benchAvgWeight ?? null;
    const totalEffect = r.totalEffect ?? null;
    const activeWeight =
      fundWeight !== null && benchWeight !== null ? fundWeight - benchWeight : null;

    const prev = prevMap.get(r.security) ?? null;
    const prevFundWeight = prev?.fundAvgWeight ?? null;
    const prevTotalEffect = prev?.totalEffect ?? null;

    const deltaWeight =
      fundWeight !== null && prevFundWeight !== null
        ? fundWeight - prevFundWeight
        : fundWeight;

    const deltaTotalEffect =
      totalEffect !== null && prevTotalEffect !== null
        ? totalEffect - prevTotalEffect
        : totalEffect;

    return {
      security: r.security,
      fundWeight,
      benchWeight,
      activeWeight,
      allocEffect: r.allocEffect ?? null,
      selectEffect: r.selectEffect ?? null,
      totalEffect,
      deltaWeight,
      deltaTotalEffect,
    };
  });

  // ── Build history timeseries (current year only) ──────────────────────────
  const currentYear = latestDateStr.substring(0, 4);

  const historyRows = await prisma.performanceAttribution.findMany({
    where: {
      fund,
      rowType: "company",
      reportDate: {
        gte: new Date(`${currentYear}-01-01`),
      },
    },
    select: { reportDate: true, security: true, fundAvgWeight: true, totalEffect: true },
    orderBy: { reportDate: "asc" },
  });

  const history: Record<string, HistoryPoint[]> = {};
  for (const row of historyRows) {
    const date = toISO(row.reportDate);
    if (!history[row.security]) history[row.security] = [];
    history[row.security].push({
      date,
      weight: row.fundAvgWeight ?? null,
      totalEffect: row.totalEffect ?? null,
    });
  }

  return NextResponse.json({
    fund,
    currentDate: latestDateStr,
    currentPeriod,
    history,
  });
}
