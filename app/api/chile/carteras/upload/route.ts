import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, getSessionUser } from "@/lib/auth";
import { normBBG } from "@/lib/bbg";
import { logAdminChanges } from "@/lib/adminLog";
import {
  norm, cleanBBG, NAME_OVERRIDES, SERIES_NAMES,
  buildTickerUnits, type TickerUnitInput,
} from "@/lib/ssHomologacion";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ── Carga del Excel mensual de carteras ────────────────────────────────────────
// Formato esperado (una sola hoja, rectangular):
//
//     A          B                    C         D      E     ...
//   1 (vacío)    (vacío)              Pionero   MCF    MRV        ← nombres de fondo
//   2 CAP        CAP CI EQUITY        0         0      0.21
//   3 Andina-A   ANDINAA CI EQUITY    9.568     0      0
//
// Reglas del archivo (acordadas con el usuario):
//   · Las acciones vienen en MILLONES, igual que stock_selection_v1.shares. No se reescala.
//   · Vienen SÓLO las series individuales (Andina-A, Andina-B). La fila madre que las suma
//     NO debe venir: duplicaría la posición, porque cada serie ya se carga aparte.
//   · El cruce es exclusivamente por TICKER (columna B). El nombre de la columna A se
//     guarda para poder leer la tabla a ojo, pero no participa del matcheo.
//
// El POST tiene dos modos. Sin `confirm` devuelve el PREVIEW y no escribe nada; con
// `confirm=true` reemplaza la foto completa del mes dentro de una transacción.

const MAX_SIZE_BYTES = 8 * 1024 * 1024;
const MAX_FONDOS = 30;
const MAX_ROWS = 5000;

export interface CarteraIssue {
  company: string;          // columna A, tal como vino
  tickerRaw: string;        // columna B, tal como vino
  /** Motivo por el que la fila no puede entrar al sumaproducto. */
  problem: "sin-ticker" | "sin-match" | "sin-acciones";
  /** Fondos con posición > 0 en esta fila: si hay alguno, la posición se PIERDE. */
  posiciones: { fondo: string; shares: number }[];
}

export interface CarteraFondoResumen {
  fondo: string;
  empresas: number;        // filas con posición > 0 que sí cruzaron
  empresasPerdidas: number; // filas con posición > 0 que NO cruzaron
}

export interface CarteraUploadResult {
  ok: boolean;
  confirmed: boolean;
  asOf: string;              // YYYY-MM-DD (primer día del mes)
  sheet: string;
  fondos: string[];
  filas: number;             // filas de empresa leídas
  cruzan: number;            // filas cuyo ticker resolvió a una unidad con acciones
  issues: CarteraIssue[];    // TODAS las que no cruzan, tengan o no posición
  issuesConPosicion: number;
  resumen: CarteraFondoResumen[];
  /** Tickers repetidos dentro del archivo (la última fila gana). */
  duplicados: string[];
  /** Encabezados de la fila 1 que NO se tomaron como fondo por no tener datos numéricos. */
  columnasIgnoradas: string[];
  /** Tickers que apuntan a dos unidades distintas de la vista — homologación rota. */
  colisiones: string[];
  escritas?: number;         // filas insertadas (sólo con confirm)
  error?: string;
}

// Celda numérica tolerante: Excel manda number, pero un pegado manual puede dejar
// texto con separadores de miles. Vacío / no numérico → null (no es 0: "no hay dato").
function numCell(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const s = v.replace(/\s| /g, "").replace(/,/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** "2026-09" | "2026-09-17" | "" → primer día del mes, UTC. */
function parseAsOf(raw: string | null): Date {
  const now = new Date();
  const m = (raw ?? "").trim().match(/^(\d{4})-(\d{2})/);
  const y = m ? parseInt(m[1], 10) : now.getUTCFullYear();
  const mo = m ? parseInt(m[2], 10) : now.getUTCMonth() + 1;
  return new Date(Date.UTC(y, Math.min(Math.max(mo, 1), 12) - 1, 1));
}

// ── Índice ticker → unidad, resuelto EXACTAMENTE como la vista ─────────────────
// Réplica de la resolución de app/api/chile/stock-selection-v1/route.ts: mismo
// NAME_OVERRIDES, mismo SERIES_NAMES, mismo criterio de desempate por ticker Yahoo.
// Las constantes salen de lib/ssHomologacion.ts para que no puedan divergir.
async function loadTickerUnits() {
  const [empresas, isins, shareRows] = await Promise.all([
    prisma.empresasIndustriasV2.findMany({
      select: { nombreLatam: true, nombreChile: true, isin: true, tickerBloomberg: true, yahooFinanceTicker: true },
    }),
    prisma.companyIsin.findMany({ select: { isin: true, yahooFinanceTicker: true } }),
    prisma.stockSelectionV1.findMany({
      where: { metric: "shares" },
      select: { company: true, series: true, fiscalYear: true, quarter: true, value: true },
    }),
  ]);

  const yahooByIsin = new Map<string, string>();
  for (const c of isins) if (c.isin && c.yahooFinanceTicker?.trim()) yahooByIsin.set(c.isin.trim(), c.yahooFinanceTicker.trim());

  type Emp = (typeof empresas)[number];
  const byName = new Map<string, Emp[]>();
  const addName = (key: string | null, row: Emp) => {
    const k = norm(key); if (!k) return;
    const arr = byName.get(k) ?? [];
    if (!arr.includes(row)) arr.push(row);
    byName.set(k, arr);
  };
  for (const e of empresas) {
    if (!norm(e.nombreLatam)) continue;
    addName(e.nombreLatam, e); addName(e.nombreChile, e);
  }
  const yahooOf = (r: Emp): string | null =>
    r.yahooFinanceTicker?.trim() || (r.isin ? yahooByIsin.get(r.isin.trim()) ?? null : null);
  const empByName = (key: string): Emp | null => byName.get(norm(key))?.[0] ?? null;
  const resolveBBG = (company: string): string | null => {
    const key = norm(company);
    let rows = byName.get(key);
    if ((!rows || !rows.length) && NAME_OVERRIDES[key]) rows = byName.get(NAME_OVERRIDES[key]);
    if (!rows || !rows.length) return null;
    const scored = rows.map((r) => { const y = yahooOf(r); return { r, score: y ? (/\.SN$/i.test(y) ? 2 : 1) : 0 }; });
    scored.sort((a, b) => b.score - a.score);
    return cleanBBG(scored[0].r.tickerBloomberg);
  };

  // Acciones vigentes por compañía/serie (la foto más reciente), igual que latestOf().
  const latest = new Map<string, { key: number; value: number }>();
  for (const r of shareRows) {
    if (r.value == null) continue;
    const k = `${norm(r.company)}|${r.series}`;
    const key = r.fiscalYear * 10 + r.quarter;
    const cur = latest.get(k);
    if (!cur || key > cur.key) latest.set(k, { key, value: r.value });
  }

  const names = [...new Set(shareRows.map((r) => r.company))];
  const inputs: TickerUnitInput[] = names.map((company) => {
    const k = norm(company);
    const sn = SERIES_NAMES[k];
    const dual = !!sn && latest.has(`${k}|A`) && latest.has(`${k}|B`);
    return {
      company,
      tickerBBG: resolveBBG(company),
      dual,
      bbgA: dual ? cleanBBG(empByName(sn.A)?.tickerBloomberg) : null,
      bbgB: dual ? cleanBBG(empByName(sn.B)?.tickerBloomberg) : null,
    };
  });

  const { units, collisions } = buildTickerUnits(inputs, normBBG);
  // ¿La unidad tiene acciones para dividir? Sin denominador no hay ponderador.
  const hasShares = (unitKey: string): boolean => {
    const m = unitKey.match(/^(.*)-([ab])$/);
    return m ? latest.has(`${m[1]}|${m[2].toUpperCase()}`) : latest.has(`${unitKey}|TOTAL`);
  };
  return { units, collisions, hasShares };
}

export async function POST(request: Request) {
  const deny = await requireAdmin();
  if (deny) return deny;

  try {
    const form = await request.formData();
    const file = form.get("file") as File | null;
    const confirm = String(form.get("confirm") ?? "") === "true";
    const asOf = parseAsOf(form.get("asOf") as string | null);

    if (!file) return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
    if (file.size > MAX_SIZE_BYTES) return NextResponse.json({ error: "El archivo supera los 8 MB" }, { status: 413 });

    // Import dinámico: xlsx-js-style es un bundle grande y CommonJS; así no entra al
    // grafo de módulos de rutas que no lo usan.
    const XLSX = (await import("xlsx-js-style")).default ?? (await import("xlsx-js-style"));
    let wb;
    try {
      wb = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: "buffer" });
    } catch {
      return NextResponse.json({ error: "No se pudo leer el archivo: ¿es un .xlsx válido?" }, { status: 400 });
    }
    const sheet = wb.SheetNames[0];
    if (!sheet) return NextResponse.json({ error: "El archivo no tiene hojas" }, { status: 400 });
    const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheet], { header: 1, raw: true, defval: null });

    // ── Detección de fondos: 100% dinámica ────────────────────────────────────
    // Los fondos son lo que diga la fila 1 desde la columna C, sin ninguna lista fija: si
    // el mes que viene aparece una columna nueva se carga sola, y si un fondo deja de venir
    // simplemente no existe en esa foto (la vista arma sus filas desde lo cargado).
    //
    // Se recorre el encabezado ENTERO en vez de cortar en la primera celda vacía: cortar
    // ahí hacía que un fondo agregado después de una columna en blanco se perdiera en
    // silencio, que es el peor de los dos errores. Para no tomar por fondo una nota suelta
    // a la derecha de la tabla, se exige que la columna tenga al menos una celda numérica
    // debajo. Igual el preview lista los fondos detectados antes de escribir nada.
    const head = (grid[0] ?? []) as unknown[];
    const cuerpo = grid.slice(1) as unknown[][];
    const columnaTieneNumeros = (col: number): boolean =>
      cuerpo.some((r) => numCell((r ?? [])[col]) != null);

    const fondos: string[] = [];
    const colDeFondo: number[] = [];
    const ignoradas: string[] = [];
    for (let i = 2; i < head.length; i++) {
      const h = head[i];
      if (typeof h !== "string" || !h.trim()) continue;
      const nombre = h.trim();
      if (!columnaTieneNumeros(i)) { ignoradas.push(nombre); continue; }
      if (nombre.length > 40) {
        return NextResponse.json({ error: `Nombre de fondo demasiado largo: “${nombre.slice(0, 50)}…”` }, { status: 400 });
      }
      if (fondos.includes(nombre)) {
        return NextResponse.json({ error: `El fondo “${nombre}” aparece en dos columnas` }, { status: 400 });
      }
      fondos.push(nombre);
      colDeFondo.push(i);
    }
    if (!fondos.length) {
      return NextResponse.json({ error: "No encontré ninguna columna de fondo con datos en la fila 1, desde la columna C" }, { status: 400 });
    }
    if (fondos.length > MAX_FONDOS) {
      return NextResponse.json({ error: `Demasiados fondos (${fondos.length})` }, { status: 400 });
    }

    const { units, collisions, hasShares } = await loadTickerUnits();

    interface Parsed { company: string; tickerRaw: string; ticker: string | null; shares: Map<string, number> }
    const parsed: Parsed[] = [];
    for (const row of grid.slice(1)) {
      const r = (row ?? []) as unknown[];
      const company = typeof r[0] === "string" ? r[0].trim() : "";
      const tickerRaw = typeof r[1] === "string" ? r[1].trim() : r[1] != null ? String(r[1]).trim() : "";
      if (!company && !tickerRaw) continue;           // fila vacía
      const shares = new Map<string, number>();
      fondos.forEach((f, i) => {
        const v = numCell(r[colDeFondo[i]]);
        if (v != null && v > 0) shares.set(f, v);
      });
      parsed.push({ company, tickerRaw, ticker: normBBG(tickerRaw), shares });
      if (parsed.length > MAX_ROWS) {
        return NextResponse.json({ error: `El archivo tiene más de ${MAX_ROWS} filas` }, { status: 400 });
      }
    }
    if (!parsed.length) return NextResponse.json({ error: "No encontré filas de empresa bajo el encabezado" }, { status: 400 });

    // ── Resolver y separar lo que cruza de lo que no ──────────────────────────
    const issues: CarteraIssue[] = [];
    const buenas: { ticker: string; company: string; shares: Map<string, number> }[] = [];
    const vistos = new Map<string, number>();
    const duplicados: string[] = [];

    for (const p of parsed) {
      const posiciones = [...p.shares].map(([fondo, shares]) => ({ fondo, shares }));
      if (!p.ticker) { issues.push({ company: p.company, tickerRaw: p.tickerRaw, problem: "sin-ticker", posiciones }); continue; }
      const u = units.get(p.ticker);
      if (!u) { issues.push({ company: p.company, tickerRaw: p.tickerRaw, problem: "sin-match", posiciones }); continue; }
      if (!hasShares(u.unitKey)) { issues.push({ company: p.company, tickerRaw: p.tickerRaw, problem: "sin-acciones", posiciones }); continue; }
      const n = (vistos.get(p.ticker) ?? 0) + 1;
      vistos.set(p.ticker, n);
      if (n === 2) duplicados.push(p.ticker);
      buenas.push({ ticker: p.ticker, company: p.company, shares: p.shares });
    }

    const resumen: CarteraFondoResumen[] = fondos.map((f) => ({
      fondo: f,
      empresas: buenas.filter((b) => b.shares.has(f)).length,
      empresasPerdidas: issues.filter((i) => i.posiciones.some((p) => p.fondo === f)).length,
    }));

    const result: CarteraUploadResult = {
      ok: true,
      confirmed: false,
      asOf: asOf.toISOString().slice(0, 10),
      sheet,
      fondos,
      filas: parsed.length,
      cruzan: buenas.length,
      issues,
      issuesConPosicion: issues.filter((i) => i.posiciones.length > 0).length,
      resumen,
      duplicados,
      columnasIgnoradas: ignoradas,
      colisiones: collisions,
    };

    if (!confirm) return NextResponse.json(result);

    // ── Escritura: la foto del mes se reemplaza entera ────────────────────────
    // Sólo se guardan las posiciones > 0: una fila en 0 no aporta nada al sumaproducto
    // y sólo ensucia la tabla. Ticker repetido → gana la última fila del archivo.
    const porClave = new Map<string, { asOf: Date; fondo: string; tickerBBG: string; company: string | null; shares: number; source: string | null; ingestedBy: string | null }>();
    const user = await getSessionUser();
    const source = file.name.slice(0, 200);
    for (const b of buenas) {
      for (const [fondo, shares] of b.shares) {
        porClave.set(`${fondo}|${b.ticker}`, {
          asOf, fondo, tickerBBG: b.ticker, company: b.company || null, shares,
          source, ingestedBy: user?.email ?? null,
        });
      }
    }
    const data = [...porClave.values()];
    await prisma.$transaction([
      prisma.carteras.deleteMany({ where: { asOf } }),
      prisma.carteras.createMany({ data }),
    ]);
    await logAdminChanges([{
      entity: "carteras",
      entityKey: result.asOf,
      field: "snapshot",
      label: source,
      newValue: `${data.length} posiciones · ${fondos.length} fondos · ${issues.length} sin cruzar`,
      action: "create",
    }], user?.email ?? null);

    return NextResponse.json({ ...result, confirmed: true, escritas: data.length });
  } catch (err) {
    console.error("[carteras upload]", err);
    return NextResponse.json({ error: "No se pudo procesar el archivo" }, { status: 500 });
  }
}
