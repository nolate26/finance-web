import { prisma } from "@/lib/prisma";

// Resolución de security_aliases (ver el modelo SecurityAlias en schema.prisma).
//
// Un alias apunta a un papel de la maestra (bbgTicker) o, si el papel no está en la maestra,
// guarda su propio isin / yahooTicker. El yahooTicker del alias, cuando existe, MANDA sobre el
// de la maestra: es el que el track record usa para bajar precios.

/** Fuente de los nombres de AnalystRecommendationHistory.company. */
export const TRACK_RECORD = "track_record";

export interface ResolvedAlias {
  alias: string;
  bbgTicker: string | null;
  isin: string | null;
  yahoo: string | null;
}

const clean = (s: string | null | undefined) => s?.trim() || null;

const SELECT = {
  alias: true, bbgTicker: true, isin: true, yahooTicker: true,
  empresa: { select: { isin: true, yahooFinanceTicker: true } },
} as const;

type Row = {
  alias: string; bbgTicker: string | null; isin: string | null; yahooTicker: string | null;
  empresa: { isin: string; yahooFinanceTicker: string | null } | null;
};

function resolve(r: Row): ResolvedAlias {
  return {
    alias: r.alias,
    bbgTicker: r.bbgTicker,
    isin: clean(r.isin) ?? clean(r.empresa?.isin),
    yahoo: clean(r.yahooTicker) ?? clean(r.empresa?.yahooFinanceTicker),
  };
}

/** Un alias de una fuente, resuelto contra la maestra. null si no está registrado. */
export async function resolveAlias(aliasSource: string, alias: string): Promise<ResolvedAlias | null> {
  const r = await prisma.securityAlias.findUnique({
    where: { aliasSource_alias: { aliasSource, alias } },
    select: SELECT,
  });
  return r ? resolve(r) : null;
}

/** Todos los alias de una fuente, resueltos. */
export async function loadAliases(aliasSource: string): Promise<ResolvedAlias[]> {
  const rows = await prisma.securityAlias.findMany({ where: { aliasSource }, select: SELECT, orderBy: { alias: "asc" } });
  return rows.map(resolve);
}

/**
 * Dado lo que el usuario declara para un alias nuevo (Yahoo obligatorio, ISIN opcional), busca
 * el papel en la maestra con la misma regla que la migración de company_isins: 1º por Yahoo,
 * 2º por ISIN. Devuelve los campos a guardar: con match, isin y yahoo quedan en null salvo que
 * el Yahoo declarado contradiga al de la maestra.
 */
export async function aliasFieldsFor(yahoo: string, isin: string | null):
  Promise<{ bbgTicker: string | null; isin: string | null; yahooTicker: string | null }> {
  const y = yahoo.trim(), i = clean(isin);
  const hits = await prisma.empresasIndustriasV2.findMany({
    where: { OR: [{ yahooFinanceTicker: { equals: y, mode: "insensitive" } }, ...(i ? [{ isin: i }] : [])] },
    select: { tickerBloomberg: true, yahooFinanceTicker: true },
    orderBy: { tickerBloomberg: "asc" },
  });
  const byYahoo = hits.filter((h) => h.yahooFinanceTicker?.trim().toUpperCase() === y.toUpperCase());
  // Empate (mismo papel listado en dos bolsas): Yahoo sin sufijo de bolsa ⇒ el listado en US.
  const pool = byYahoo.length ? byYahoo : hits;
  const wantUS = !y.includes(".");
  const hit = pool.find((h) => h.tickerBloomberg.endsWith(" US EQUITY") === wantUS) ?? pool[0];
  if (!hit) return { bbgTicker: null, isin: i, yahooTicker: y };
  const sameYahoo = hit.yahooFinanceTicker?.trim().toUpperCase() === y.toUpperCase();
  return { bbgTicker: hit.tickerBloomberg, isin: null, yahooTicker: sameYahoo ? null : y };
}
