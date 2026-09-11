import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, getSessionUser } from "@/lib/auth";
import { logAdminChanges, ENTITY } from "@/lib/adminLog";
import { normBBG } from "@/lib/bbg";
import { norm, cleanBBG, NAME_OVERRIDES, SERIES_NAMES } from "@/lib/ssHomologacion";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Filas de Stock Selection: qué compañías hay, cuáles se ven, y por qué las que no se ven
// no se ven. Reproduce la resolución de la vista con las MISMAS reglas (lib/ssHomologacion)
// para que el diagnóstico no mienta.
//
// Existe porque el modo de falla de esta vista es silencioso: si un nombre de
// stock_selection_v1 no homologa contra empresas_industrias_v2, el loop hace `continue` y
// la compañía desaparece sin ningún aviso.

export type RowStatus = "ok" | "sin-homologacion" | "oculta" | "sin-retornos" | "sembrada";

export interface SsRowSeries {
  label: string;
  bbg: string | null;
  hasReturnRow: boolean;  // hay fila en ticker_return_snapshot para ese BBG
  hasAnyReturn: boolean;  // ...y trae al menos un retorno no nulo
  retAsOf: string | null;
}

export interface SsRowStatus {
  company: string;          // nombre tal cual en stock_selection_v1
  key: string;              // normalizado (llave de ocultamiento)
  status: RowStatus;
  visible: boolean;         // ¿la vista la está mostrando?
  hidden: boolean;          // ¿ocultada a mano?
  hiddenReason: string | null;
  empresaId: number | null; // fila de empresas_industrias_v2 que resolvió (para editarla)
  tickerBBG: string | null;
  yahooTicker: string | null;
  industria: string | null;
  dual: boolean;
  series: SsRowSeries[];    // una entrada por serie que la vista dibuja
  quarters: number;         // filas cargadas en stock_selection_v1
  /** Existe sólo por su homologación + overrides; el cargador todavía no la trae. */
  seeded: boolean;
  /** Filas que vinieron de clonar el historial de otra compañía (cloned_from != null). */
  clonedRows: number;
  /** De qué compañía se clonaron. */
  clonedFrom: string | null;
}

// ── GET — estado de todas las filas ─────────────────────────────────────────────
export async function GET() {
  const deny = await requireAdmin();
  if (deny) return deny;

  try {
    const [ssGroups, empresas, hiddenRows, snapRows, overrideRows, clonedRows] = await Promise.all([
      prisma.stockSelectionV1.groupBy({ by: ["company"], _count: { _all: true } }),
      prisma.empresasIndustriasV2.findMany({
        select: { id: true, nombreLatam: true, nombreChile: true, tickerBloomberg: true, yahooFinanceTicker: true, industriaChile: true },
      }),
      // Resilientes: si falta `prisma db push` el panel igual carga, sin visibilidad ni retornos.
      prisma.stockSelectionHidden.findMany().catch(() => []),
      prisma.tickerReturnSnapshot.findMany({
        select: { tickerBBG: true, asOf: true, retMonth: true, retYtd: true, retYear: true, ret3y: true, ret5y: true },
      }).catch(() => []),
      // Compañías dadas de alta a mano: tienen valores en la capa de overrides pero todavía
      // ninguna fila en stock_selection_v1. La vista ya las muestra; este panel tiene que
      // listarlas o el alta quedaría sin ningún lugar donde verse.
      prisma.stockSelectionOverride.findMany({ select: { company: true } }).catch(() => []),
      // Filas que salieron de clonar otra compañía. Se muestran aparte porque el cargador
      // NO las va a pisar (createMany/skipDuplicates): hay que borrarlas a mano cuando
      // llegue el dato real, y para eso primero hay que poder verlas.
      prisma.stockSelectionV1.findMany({
        where: { clonedFrom: { not: null } },
        select: { company: true, clonedFrom: true },
      }).catch(() => []),
    ]);
    const clonadas = new Map<string, { n: number; from: string | null }>();
    for (const r of clonedRows) {
      const k = norm(r.company);
      const cur = clonadas.get(k) ?? { n: 0, from: r.clonedFrom };
      cur.n++;
      clonadas.set(k, cur);
    }

    type Emp = (typeof empresas)[number];
    const byName = new Map<string, Emp[]>();
    const add = (k: string | null, row: Emp) => {
      const n = norm(k); if (!n) return;
      if (!byName.has(n)) byName.set(n, []);
      const arr = byName.get(n)!; if (!arr.includes(row)) arr.push(row);
    };
    for (const e of empresas) { if (!norm(e.nombreLatam)) continue; add(e.nombreLatam, e); add(e.nombreChile, e); }

    // Mismo criterio de desempate que la vista: gana la fila con ticker Yahoo .SN.
    const resolve = (company: string): Emp | null => {
      const k = norm(company);
      let rows = byName.get(k);
      if ((!rows || !rows.length) && NAME_OVERRIDES[k]) rows = byName.get(NAME_OVERRIDES[k]);
      if (!rows || !rows.length) return null;
      const scored = rows.map((r) => ({ r, score: r.yahooFinanceTicker ? (/\.SN$/i.test(r.yahooFinanceTicker) ? 2 : 1) : 0 }));
      scored.sort((a, b) => b.score - a.score);
      return scored[0].r;
    };
    const empByName = (k: string): Emp | null => byName.get(norm(k))?.[0] ?? null;

    const hiddenMap = new Map(hiddenRows.map((h) => [h.company, h]));
    const snapMap = new Map<string, (typeof snapRows)[number]>();
    for (const s of snapRows) { const k = normBBG(s.tickerBBG); if (k) snapMap.set(k, s); }
    const retInfo = (bbg: string | null): Omit<SsRowSeries, "label" | "bbg"> => {
      const s = bbg ? snapMap.get(normBBG(bbg) ?? "") : null;
      if (!s) return { hasReturnRow: false, hasAnyReturn: false, retAsOf: null };
      const anyRet = [s.retMonth, s.retYtd, s.retYear, s.ret3y, s.ret5y].some((v) => v != null);
      return { hasReturnRow: true, hasAnyReturn: anyRet, retAsOf: s.asOf.toISOString().slice(0, 10) };
    };

    // Universo del panel = stock_selection_v1 + las sembradas a mano (mismo criterio que
    // la vista, app/api/chile/stock-selection-v1/route.ts).
    const cargadas = new Set(ssGroups.map((g) => norm(g.company)));
    const entradas: { company: string; quarters: number; seeded: boolean }[] = ssGroups.map((g) => ({
      company: g.company, quarters: g._count._all, seeded: false,
    }));
    const sembradasVistas = new Set<string>();
    for (const o of overrideRows) {
      const k = norm(o.company);
      if (!k || cargadas.has(k) || sembradasVistas.has(k)) continue;
      sembradasVistas.add(k);
      entradas.push({ company: o.company, quarters: 0, seeded: true });
    }

    const out: SsRowStatus[] = entradas.map((g) => {
      const key = norm(g.company);
      const emp = resolve(g.company);
      const hid = hiddenMap.get(key) ?? null;
      const sn = SERIES_NAMES[key];

      const series: SsRowSeries[] = [];
      if (sn && emp) {
        for (const lab of ["A", "B"] as const) {
          const row = empByName(sn[lab]);
          const bbg = cleanBBG(row?.tickerBloomberg);
          series.push({ label: lab, bbg, ...retInfo(bbg) });
        }
      }
      const mainBbg = cleanBBG(emp?.tickerBloomberg);
      series.push({ label: sn ? "consolidada" : "TOTAL", bbg: mainBbg, ...retInfo(mainBbg) });

      const visible = !!emp && !hid;
      // Orden del estado = orden en que conviene arreglarlo: sin homologación no se ve
      // nada; oculta es una decisión ya tomada; sembrada es un alta a la espera de su
      // primera carga; sin retornos es sólo una celda vacía.
      const status: RowStatus = !emp ? "sin-homologacion"
        : hid ? "oculta"
        : g.seeded ? "sembrada"
        : series.some((s) => !s.hasAnyReturn) ? "sin-retornos"
        : "ok";

      return {
        company: g.company, key, status, visible,
        hidden: !!hid, hiddenReason: hid?.reason ?? null,
        empresaId: emp?.id ?? null,
        tickerBBG: mainBbg,
        yahooTicker: emp?.yahooFinanceTicker ?? null,
        industria: emp?.industriaChile ?? null,
        dual: !!sn,
        series,
        quarters: g.quarters,
        seeded: g.seeded,
        clonedRows: clonadas.get(key)?.n ?? 0,
        clonedFrom: clonadas.get(key)?.from ?? null,
      };
    });
    out.sort((a, b) => a.company.localeCompare(b.company));

    // El otro lado del hueco: tickers del snapshot que ninguna fila de la vista consume.
    const wanted = new Set<string>();
    for (const r of out) for (const s of r.series) { const k = normBBG(s.bbg); if (k) wanted.add(k); }
    const unusedReturns = [...snapMap.keys()].filter((k) => !wanted.has(k)).sort();

    return NextResponse.json({
      rows: out,
      counts: {
        total: out.length,
        ok: out.filter((r) => r.status === "ok").length,
        sinHomologacion: out.filter((r) => r.status === "sin-homologacion").length,
        ocultas: out.filter((r) => r.status === "oculta").length,
        sinRetornos: out.filter((r) => r.status === "sin-retornos").length,
        sembradas: out.filter((r) => r.status === "sembrada").length,
      },
      snapshotRows: snapRows.length,
      unusedReturns,
    });
  } catch (err) {
    console.error("[admin/ss-rows GET]", err);
    return NextResponse.json({ error: "No se pudo cargar el estado de las filas" }, { status: 500 });
  }
}

// ── PUT — ocultar / mostrar una fila ────────────────────────────────────────────
// Ocultar NO borra nada: es una marca en stock_selection_hidden que la vista consulta.
// Para sacar una compañía de la tabla hay que borrar sus fundamentales, que no se hace
// desde acá.
interface PutBody { company?: string; hidden?: boolean; reason?: string | null }

export async function PUT(request: NextRequest) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const user = await getSessionUser();

  let body: PutBody;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const label = typeof body.company === "string" ? body.company.trim() : "";
  const key = norm(label);
  if (!key) return NextResponse.json({ error: "Falta la compañía" }, { status: 400 });
  if (key.length > 120) return NextResponse.json({ error: "Nombre demasiado largo" }, { status: 400 });
  if (typeof body.hidden !== "boolean") return NextResponse.json({ error: "Falta `hidden` (true/false)" }, { status: 400 });
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) || null : null;

  try {
    if (body.hidden) {
      await prisma.stockSelectionHidden.upsert({
        where: { company: key },
        create: { company: key, label, reason, hiddenBy: user?.email ?? null },
        update: { reason, hiddenBy: user?.email ?? null },
      });
    } else {
      await prisma.stockSelectionHidden.deleteMany({ where: { company: key } });
    }
    await logAdminChanges(
      [{
        entity: ENTITY.ssHidden, entityKey: key, label, field: "visibilidad",
        oldValue: body.hidden ? "visible" : "oculta",
        newValue: body.hidden ? "oculta" : "visible",
        context: reason,
      }],
      user?.email ?? null,
    );
    return NextResponse.json({ ok: true, company: key, hidden: body.hidden });
  } catch (e) {
    console.error("[admin/ss-rows PUT]", e);
    return NextResponse.json({ error: "No se pudo cambiar la visibilidad" }, { status: 500 });
  }
}
