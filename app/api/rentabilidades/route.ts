import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export interface RentabilidadRow {
  fund: string;
  manager: string;
  group: string;
  currency: string;
  mtd: number | null;
  ytd: number | null;
  oneYear: number | null;
  threeYears: number | null;
  fiveYears: number | null;
  tenYears: number | null;
  aum: number | null;
  sharpe: number | null;
  mgmtFee: number | null;
  annSinceIncep: number | null;
  isMoneda: boolean;
}

export interface FundMeta {
  group: string;
  isMoneda: boolean;
}

// ── Date parsing ───────────────────────────────────────────────────────────────
// DB stores report_date as VARCHAR in "D/MMM/YYYY" format (e.g. "9/Jan/2026")
// Frontend expects ISO "YYYY-MM-DD" for date rendering and sorting.

const MONTH_MAP: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

/** "9/Jan/2026" → "2026-01-09". Passthrough if already ISO or unrecognised. */
function parseDateToISO(raw: string): string {
  const match = raw.match(/^(\d{1,2})\/([A-Za-z]{3})\/(\d{4})$/);
  if (match) {
    const [, day, mon, year] = match;
    const mm = MONTH_MAP[mon] ?? "01";
    return `${year}-${mm}-${day.padStart(2, "0")}`;
  }
  return raw;
}

// ── Numeric helpers ────────────────────────────────────────────────────────────
// Return fields are stored as percentages (e.g. 3.5 = 3.5%).
// The frontend multiplies by 100 to display, so we divide here to give decimals.

/** Percentage stored in DB → decimal for frontend (3.5 → 0.035). */
function toDec(v: number | null | undefined): number | null {
  if (v == null) return null;
  return v / 100;
}

// mgmt_fee is stored as a varchar like "1.25%" in the DB — parse to decimal
function parseMgmtFee(v: string | null | undefined): number | null {
  if (!v) return null;
  const s = v.replace(/%/g, "").trim();
  const n = parseFloat(s);
  return isNaN(n) ? null : n / 100;
}

function isMonedaFund(fundGroup: string | null): boolean {
  if (!fundGroup) return false;
  return fundGroup === "Moneda" || fundGroup === "Other Moneda Funds Returns";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const pageFilter = searchParams.get("page");

  // ── Find the most recent report_date ──────────────────────────────────────
  // Can't rely on DB ORDER BY because "D/MMM/YYYY" strings sort lexicographically,
  // not chronologically. Fetch all distinct dates, parse to ISO, then sort in JS.
  const allDateRecords = await prisma.monedaFundReturn.findMany({
    where: pageFilter ? { pageNum: parseInt(pageFilter, 10) } : {},
    select: { reportDate: true },
    distinct: ["reportDate"],
  });

  if (allDateRecords.length === 0) {
    return NextResponse.json({ error: "No returns data found" }, { status: 404 });
  }

  const sortedDates = allDateRecords
    .map((r) => ({ raw: r.reportDate, iso: parseDateToISO(r.reportDate) }))
    .sort((a, b) => a.iso.localeCompare(b.iso));

  const latestEntry = sortedDates[sortedDates.length - 1];
  const latestDateRaw = latestEntry.raw; // "9/Jan/2026" — used for DB WHERE clause
  const latestDateISO = latestEntry.iso; // "2026-01-09" — sent to frontend
  const reportDate = latestDateISO;

  // ── Query latest snapshot rows ────────────────────────────────────────────
  const where: { reportDate: string; pageNum?: number } = { reportDate: latestDateRaw };
  if (pageFilter) where.pageNum = parseInt(pageFilter, 10);

  const dbRows = await prisma.monedaFundReturn.findMany({ where });

  if (!pageFilter) {
    return NextResponse.json({ reportDate, pages: {} });
  }

  // ── Map DB rows → RentabilidadRow ─────────────────────────────────────────
  function mapDbRow(r: (typeof dbRows)[number]): RentabilidadRow {
    const group = r.fundGroup ?? "";
    const fund = r.fund ?? "";
    return {
      fund,
      manager: r.manager ?? "",
      group,
      currency: r.currency ?? "",
      mtd: toDec(r.mtd),
      ytd: toDec(r.ytd),
      oneYear: toDec(r.ret1y),
      threeYears: toDec(r.ret3y),
      fiveYears: toDec(r.ret5y),
      tenYears: toDec(r.ret10y),
      aum: r.aumUsdMm ?? null,
      sharpe: r.sharpe ?? null,
      mgmtFee: parseMgmtFee(r.mgmtFee),
      annSinceIncep: toDec(r.incep),
      isMoneda: isMonedaFund(group),
    };
  }

  const rows: RentabilidadRow[] = dbRows.map(mapDbRow);

  // ── For MRV (page 2): also fetch IPSA if it lives on a different page ──────
  // IPSA is the MRV benchmark but may be stored under page 1 (Pionero).
  if (pageFilter === "2" && !rows.some((r) => r.fund === "IPSA")) {
    const ipsaDbRow = await prisma.monedaFundReturn.findFirst({
      where: { fund: "IPSA", reportDate: latestDateRaw },
    });
    if (ipsaDbRow) {
      rows.push(mapDbRow(ipsaDbRow));
    }
  }

  // ── Determine chart funds ─────────────────────────────────────────────────
  const monedaFunds = rows
    .filter((r) => r.isMoneda)
    .map((r) => ({ fund: r.fund, group: r.group, isMoneda: true }));

  const peerFunds = rows
    .filter((r) => !r.isMoneda && r.group.startsWith("Peer"))
    .map((r) => ({ fund: r.fund, group: r.group, isMoneda: false }));

  const indexFunds = rows
    .filter((r) => r.group === "Indices")
    .map((r) => ({ fund: r.fund, group: r.group, isMoneda: false }));

  const chartFunds = [...monedaFunds, ...peerFunds, ...indexFunds];
  const fundSet = new Set(chartFunds.map((f) => f.fund));

  const fundMeta: Record<string, FundMeta> = {};
  for (const f of chartFunds) {
    const normalizedGroup =
      f.group === "Moneda" ? "Moneda" :
      f.group === "Other Moneda Funds Returns" && (f.fund === "Glory" || f.fund === "Mercer") ? "Moneda" :
      f.group === "Other Moneda Funds Returns" ? "Other Moneda" :
      f.group.startsWith("Peer") ? "Peer Group" :
      f.group;
    fundMeta[f.fund] = { group: normalizedGroup, isMoneda: f.isMoneda };
  }

  // ── Build YTD timeseries for current year ─────────────────────────────────
  // Year extracted from the ISO date ("2026-01-09" → "2026").
  // Dates in DB end with "/<year>" (e.g. "9/Jan/2026"), so use endsWith filter.
  const year = latestDateISO.substring(0, 4);

  // For MRV (page 2): fetch by fund name set (includes IPSA from any page).
  // For all other pages: keep the pageNum filter as before.
  const yearRows = await prisma.monedaFundReturn.findMany({
    where:
      pageFilter === "2"
        ? { reportDate: { endsWith: `/${year}` }, fund: { in: [...fundSet] } }
        : { reportDate: { endsWith: `/${year}` }, pageNum: parseInt(pageFilter, 10) },
    select: { reportDate: true, fund: true, ytd: true },
  });

  // Sort chronologically using parsed ISO dates
  yearRows.sort((a, b) =>
    parseDateToISO(a.reportDate).localeCompare(parseDateToISO(b.reportDate))
  );

  // Group by ISO date → one chart point per date
  const dateMap = new Map<string, Record<string, string | number | null>>();
  for (const row of yearRows) {
    const d = parseDateToISO(row.reportDate);
    if (!dateMap.has(d)) {
      const point: Record<string, string | number | null> = { date: d };
      for (const fund of fundSet) point[fund] = null;
      dateMap.set(d, point);
    }
    if (fundSet.has(row.fund)) {
      dateMap.get(d)![row.fund] = toDec(row.ytd);
    }
  }

  const timeseries = Array.from(dateMap.values());

  return NextResponse.json({ reportDate, file: latestDateRaw, rows, timeseries, fundMeta });
}
