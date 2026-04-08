import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ── Prisma row types ──────────────────────────────────────────────────────────

type LatamRow = Awaited<
  ReturnType<typeof prisma.latamEquitySnapshot.findMany>
>[number];

type EmpresaRow = Awaited<
  ReturnType<typeof prisma.empresasIndustrias.findMany>
>[number];

// ── Typed response shape ──────────────────────────────────────────────────────

export interface LatamCompanyDTO {
  company:        string;
  ticker:         string;
  sector:         string | null;
  priceUsdTri:    number | null;
  ret1W:          number | null;
  ret1M:          number | null;
  retYtd:         number | null;
  ret1Y:          number | null;
  ret5Y:          number | null;
  priceUsd:       number | null;
  mktCapUsd:      number | null;
  netDebtUsd:     number | null;
  evUsd:          number | null;
  peCurYr:        number | null;
  peNxtYr:        number | null;
  evEbitdaCurYr:  number | null;
  evEbitdaNxtYr:  number | null;
  evSalesCurYr:   number | null;
  evSalesNxtYr:   number | null;
  pBv:            number | null;
  leverage:       number | null;
  roeEst:         number | null;
  divYield:       number | null;
  priceLocal:     number | null;
  targetPrice:    number | null;
  tpUpside:       number | null;
  niRealQ1:       number | null;
  niRealQ2:       number | null;
  niRealQ3:       number | null;
  niRealQ4:       number | null;
  niEstQ1:        number | null;
  niEstQ2:        number | null;
  niEstQ3:        number | null;
  niEstQ4:        number | null;
  niYoyQ1:        number | null;
  niYoyQ2:        number | null;
  niYoyQ3:        number | null;
  niYoyQ4:        number | null;
  epsEst:         number | null;
  epsRev1W:       number | null;
  epsRev4W:       number | null;
  epsRev3M:       number | null;
}

// ── Mapper ────────────────────────────────────────────────────────────────────

function toDTO(snap: LatamRow, empresa: EmpresaRow | undefined): LatamCompanyDTO {
  return {
    company:        empresa?.nombreLatam ?? snap.ticker,
    ticker:         snap.ticker,
    sector:         empresa?.industriaGics ?? null,

    priceUsdTri:    snap.priceUsdTri,
    ret1W:          snap.ret1W,
    ret1M:          snap.ret1M,
    retYtd:         snap.retYtd,
    ret1Y:          snap.ret1Y,
    ret5Y:          snap.ret5Y,

    priceUsd:       snap.priceUsd,
    mktCapUsd:      snap.mktCapUsd,
    netDebtUsd:     snap.netDebtUsd,
    evUsd:          snap.evUsd,

    peCurYr:        snap.peCurYr,
    peNxtYr:        snap.peNxtYr,
    evEbitdaCurYr:  snap.evEbitdaCurYr,
    evEbitdaNxtYr:  snap.evEbitdaNxtYr,
    evSalesCurYr:   snap.evSalesCurYr,
    evSalesNxtYr:   snap.evSalesNxtYr,
    pBv:            snap.pBv,
    leverage:       snap.leverage,
    roeEst:         snap.roeEst,
    divYield:       snap.divYield,

    priceLocal:     snap.priceLocal,
    targetPrice:    snap.targetPrice,
    tpUpside:       snap.tpUpside,

    niRealQ1:       snap.niRealQ1,
    niRealQ2:       snap.niRealQ2,
    niRealQ3:       snap.niRealQ3,
    niRealQ4:       snap.niRealQ4,
    niEstQ1:        snap.niEstQ1,
    niEstQ2:        snap.niEstQ2,
    niEstQ3:        snap.niEstQ3,
    niEstQ4:        snap.niEstQ4,
    niYoyQ1:        snap.niYoyQ1,
    niYoyQ2:        snap.niYoyQ2,
    niYoyQ3:        snap.niYoyQ3,
    niYoyQ4:        snap.niYoyQ4,

    epsEst:         snap.epsEst,
    epsRev1W:       snap.epsRev1W,
    epsRev4W:       snap.epsRev4W,
    epsRev3M:       snap.epsRev3M,
  };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET() {
  try {
    // 1. Latest snapshot date
    const latest = await prisma.latamEquitySnapshot.findFirst({
      orderBy: { snapshotDate: "desc" },
      select: { snapshotDate: true },
    });

    if (!latest) {
      return NextResponse.json(
        { error: "No LatAm equity snapshot data found" },
        { status: 404 }
      );
    }

    const latestDate = latest.snapshotDate;

    // 2. Fetch snapshot batch + empresa master in parallel
    const [snapshots, empresas] = await Promise.all([
      prisma.latamEquitySnapshot.findMany({
        where: { snapshotDate: latestDate },
        orderBy: { mktCapUsd: "desc" },
      }),
      prisma.empresasIndustrias.findMany(),
    ]);

    // 3. O(1) lookup map: normalised ticker → empresa row
    const byTicker = new Map<string, EmpresaRow>();
    for (const e of empresas) {
      if (e.tickerBloomberg) {
        byTicker.set(e.tickerBloomberg.trim().toUpperCase(), e);
      }
    }

    // 4. In-memory JOIN + map to DTO
    const companies: LatamCompanyDTO[] = snapshots.map((snap) =>
      toDTO(snap, byTicker.get(snap.ticker.trim().toUpperCase()))
    );

    return NextResponse.json({
      metadata: { snapshotDate: latestDate.toISOString().split("T")[0] },
      companies,
    });
  } catch (err) {
    console.error("LatAm stock-selection API error:", err);
    return NextResponse.json(
      { error: "Failed to read LatAm equity snapshot data" },
      { status: 500 }
    );
  }
}
