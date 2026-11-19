import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin, getSessionUser } from "@/lib/auth";
import { normBBG } from "@/lib/bbg";
import { logAdminChanges, ENTITY } from "@/lib/adminLog";

export const dynamic = "force-dynamic";

// Admin Issues → Fichas: control de lo que subió la macro "Send Ficha", por ticker.
//   GET                → un resumen por ticker con su diagnóstico
//   DELETE ?ticker=X   → borra TODO lo de ese ticker (statements, KPIs y comentarios)
// Sólo admin. El borrado queda en admin_change_log.
//
// Diagnóstico (lo que suele salir mal al subir):
//   error · el ticker no existe en empresas_industrias_v2 (mal escrito: la ficha no aparece
//           en Stock Selection ni se homologa con nada)
//   error · dos tickers que son la misma compañía ("ANDINAB CI" y "ANDINAB CI EQUITY")
//   aviso · formato distinto de "XXXX CI EQUITY"
//   aviso · faltan líneas que usan Stock Selection y Last Ficha
//   aviso · la ficha está atrasada respecto de la más nueva cargada

export interface FichaAdminRow {
  ticker: string;
  name: string | null;           // nombre en la maestra; null = no está
  status: "ok" | "warn" | "error";
  issues: string[];
  currency: string | null;
  fx: number | null;
  yearMin: number | null;
  yearMax: number | null;
  lastQuarter: string | null;    // "3Q26"
  ltm: string | null;            // "3Q26"
  statements: number;
  kpis: number;
  comments: number;
  updatedAt: string | null;      // ISO, última carga
}

// Líneas que leen Stock Selection (lib/ssFichaModel.ts) y los ratios de Last Ficha.
const CORE_LINES = ["Revenues", "EBITDA", "EBIT", "Controlling Net Income", "Total Net Debt", "Controlling Equity"];
const TICKER_RE = /^\S+ [A-Z]{2} EQUITY$/;

const qLabel = (i: number) => `${(i % 4) + 1}Q${String(Math.floor(i / 4)).slice(2)}`;

interface StRow {
  ticker: string; n: number; upd: Date | null; ymin: number | null; ymax: number | null;
  qmax: number | null; lmax: number | null; cur: string | null; fx: string | null; core: string[] | null;
}

export async function GET() {
  const deny = await requireAdmin();
  if (deny) return deny;
  try {
    const [st, kp, cm, emp] = await Promise.all([
      prisma.$queryRaw<StRow[]>`
        SELECT ticker,
               COUNT(*)::int                                                     AS n,
               MAX(updated_at)                                                   AS upd,
               MIN(year) FILTER (WHERE period_type = 'A')                        AS ymin,
               MAX(year) FILTER (WHERE period_type = 'A')                        AS ymax,
               MAX(year * 4 + quarter - 1) FILTER (WHERE period_type = 'Q')      AS qmax,
               MAX(year * 4 + quarter - 1) FILTER (WHERE period_type = 'L')      AS lmax,
               MAX(currency)                                                     AS cur,
               MAX(fx)::text                                                     AS fx,
               array_agg(DISTINCT line) FILTER (WHERE line IN (${Prisma.join(CORE_LINES)})) AS core
        FROM ficha_statements GROUP BY ticker`,
      prisma.$queryRaw<{ ticker: string; n: number; upd: Date | null }[]>`
        SELECT ticker, COUNT(*)::int AS n, MAX(updated_at) AS upd FROM ficha_kpis GROUP BY ticker`,
      prisma.$queryRaw<{ ticker: string; n: number }[]>`
        SELECT ticker, COUNT(*)::int AS n FROM ficha_comments GROUP BY ticker`,
      prisma.empresasIndustriasV2.findMany({ select: { tickerBloomberg: true, nombreChile: true, nombreLatam: true } }),
    ]);

    const names = new Map<string, string>();
    for (const e of emp) {
      const k = normBBG(e.tickerBloomberg), nm = (e.nombreChile?.trim() || e.nombreLatam?.trim())?.replace(/-[AB]$/i, "");
      if (k && !names.has(k)) names.set(k, nm || k);
    }

    const stBy = new Map(st.map((r) => [r.ticker, r]));
    const kpBy = new Map(kp.map((r) => [r.ticker, r]));
    const cmBy = new Map(cm.map((r) => [r.ticker, r.n]));
    const tickers = [...new Set([...stBy.keys(), ...kpBy.keys(), ...cmBy.keys()])];
    const newestQ = Math.max(-1, ...st.map((r) => r.qmax ?? -1));

    // Misma compañía bajo dos tickers distintos.
    const byNorm = new Map<string, string[]>();
    for (const t of tickers) {
      const k = normBBG(t) ?? t;
      byNorm.set(k, [...(byNorm.get(k) ?? []), t]);
    }

    const rows: FichaAdminRow[] = tickers.map((t) => {
      const s = stBy.get(t), k = kpBy.get(t);
      const norm = normBBG(t) ?? t;
      const name = names.get(norm) ?? null;
      const errors: string[] = [], warns: string[] = [];
      if (!name) errors.push("No está en empresas_industrias_v2: ¿ticker mal escrito?");
      const twins = (byNorm.get(norm) ?? []).filter((x) => x !== t);
      if (twins.length) errors.push(`Misma compañía cargada también como ${twins.join(", ")}`);
      if (!TICKER_RE.test(t)) warns.push('Formato distinto de "XXXX CI EQUITY"');
      if (!s) warns.push("Sólo tiene KPIs o comentarios, sin estados financieros");
      else {
        const missing = CORE_LINES.filter((l) => !(s.core ?? []).includes(l));
        if (missing.length) warns.push(`Faltan líneas: ${missing.join(", ")}`);
        if (s.qmax != null && s.qmax < newestQ) warns.push(`Atrasada: llega a ${qLabel(s.qmax)} y la más nueva a ${qLabel(newestQ)}`);
      }
      const upd = [s?.upd, k?.upd].filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0];
      return {
        ticker: t, name,
        status: errors.length ? "error" : warns.length ? "warn" : "ok",
        issues: [...errors, ...warns],
        currency: s?.cur ?? null,
        fx: s?.fx == null ? null : Number(s.fx),
        yearMin: s?.ymin ?? null, yearMax: s?.ymax ?? null,
        lastQuarter: s?.qmax == null ? null : qLabel(s.qmax),
        ltm: s?.lmax == null ? null : qLabel(s.lmax),
        statements: s?.n ?? 0, kpis: k?.n ?? 0, comments: cmBy.get(t) ?? 0,
        updatedAt: upd ? upd.toISOString() : null,
      };
    });
    const rank = { error: 0, warn: 1, ok: 2 } as const;
    rows.sort((a, b) => rank[a.status] - rank[b.status] || a.ticker.localeCompare(b.ticker));
    return NextResponse.json({ rows });
  } catch (e) {
    console.error("[admin/fichas GET]", e);
    return NextResponse.json({ error: "Error interno del servidor", details: String(e) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const deny = await requireAdmin();
  if (deny) return deny;
  // Exacto, sin normalizar: es el valor tal como quedó guardado (la lista lo muestra así).
  const ticker = request.nextUrl.searchParams.get("ticker");
  if (!ticker) return NextResponse.json({ error: "Falta ?ticker=" }, { status: 400 });
  try {
    const [st, kp, cm] = await prisma.$transaction([
      prisma.fichaStatement.deleteMany({ where: { ticker } }),
      prisma.fichaKpi.deleteMany({ where: { ticker } }),
      prisma.fichaComment.deleteMany({ where: { ticker } }),
    ]);
    if (st.count + kp.count + cm.count === 0) {
      return NextResponse.json({ error: `No hay nada cargado con el ticker "${ticker}"` }, { status: 404 });
    }
    const user = await getSessionUser();
    await logAdminChanges([{
      entity: ENTITY.ficha, entityKey: ticker, field: "ficha completa", action: "delete",
      oldValue: `${st.count} líneas, ${kp.count} KPIs, ${cm.count} comentarios`, newValue: null,
    }], user?.email ?? null);
    return NextResponse.json({ statements: st.count, kpis: kp.count, comments: cm.count });
  } catch (e) {
    console.error("[admin/fichas DELETE]", e);
    return NextResponse.json({ error: "Error interno del servidor", details: String(e) }, { status: 500 });
  }
}
