import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Validación contra la maestra (empresas_industrias_v2.ticker_bloomberg).
//
// Desde la limpieza de la BDD (B6) model_headers, bank_headers, ficha_statements, ficha_kpis,
// ficha_comments y estimates_hidden tienen FK a la maestra: un ticker que no exista ahí se
// rechaza. Los ingest validan ANTES de escribir para responder con un mensaje accionable en vez
// del error crudo de Postgres; las rutas de admin usan isFkViolation() en el catch.

/** Tickers (ya canónicos, MAYÚSCULA) que NO están en la maestra. Comparación exacta, como la FK. */
export async function missingFromMaster(tickers: string[]): Promise<string[]> {
  const unique = [...new Set(tickers.filter(Boolean))];
  if (!unique.length) return [];
  const found = await prisma.empresasIndustriasV2.findMany({
    where: { tickerBloomberg: { in: unique } },
    select: { tickerBloomberg: true },
  });
  const ok = new Set(found.map((f) => f.tickerBloomberg));
  return unique.filter((t) => !ok.has(t));
}

export function masterMissingMessage(tickers: string[]): string {
  const list = tickers.join(", ");
  return tickers.length === 1
    ? `El ticker ${list} no existe en la maestra (empresas_industrias_v2). Créalo primero en Admin Issues → Database Tables y volvé a subir.`
    : `Estos tickers no existen en la maestra (empresas_industrias_v2): ${list}. Créalos primero en Admin Issues → Database Tables y volvé a subir.`;
}

/** ¿El error es una violación de FK? Cubre el cliente de Prisma (P2003) y SQL crudo (23503). */
export function isFkViolation(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2003") return true;
    // $queryRaw / $executeRaw: Prisma envuelve el error de Postgres (P2010) con su código.
    if (e.code === "P2010" && JSON.stringify(e.meta ?? {}).includes("23503")) return true;
  }
  const code = (e as { code?: unknown } | null)?.code;
  return code === "23503" || /violates foreign key constraint/i.test(String(e));
}
