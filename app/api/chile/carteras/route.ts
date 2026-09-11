import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Foto vigente de las carteras para el sumaproducto por fondo de Stock Selection.
//
// La forma del payload copia a propósito la de IndexMembershipPayload: la vista consolida
// un fondo con la MISMA maquinaria con la que consolida un índice (sumar unidades por un
// peso), sólo que el peso es la fracción de propiedad en vez de 1. Copiando la forma, el
// front reusa ese camino en vez de abrir uno paralelo.
//
// La clave de `holdings` es JSON.stringify([fondo, tickerBBG]) — el ticker ya normalizado,
// sin " Equity". El front tiene que construirla igual (holdingKey) para que el cruce cuadre.

export interface CarterasPayload {
  asOf:     string | null;          // YYYY-MM-DD de la foto vigente
  fondos:   string[];               // orden del archivo original
  holdings: Record<string, number>; // clave JSON → acciones en MILLONES
  source:   string | null;          // archivo del que salió
  /** Meses disponibles (desc). Hoy la vista usa siempre el primero. */
  snapshots: string[];
}

// Sin `export`: Next sólo admite handlers y tipos como exports de un route.ts. El front
// construye la misma clave con JSON.parse/stringify sobre el par [fondo, ticker].
const holdingKey = (fondo: string, tickerBBG: string) => JSON.stringify([fondo, tickerBBG]);

export async function GET(request: NextRequest) {
  try {
    // Mes pedido (?asOf=YYYY-MM-DD) o el más reciente cargado.
    const want = request.nextUrl.searchParams.get("asOf");

    const all = await prisma.carteras.findMany({
      select: { asOf: true, fondo: true, tickerBBG: true, shares: true, source: true },
      orderBy: { asOf: "desc" },
    });
    if (!all.length) {
      const empty: CarterasPayload = { asOf: null, fondos: [], holdings: {}, source: null, snapshots: [] };
      return NextResponse.json(empty);
    }

    const snapshots = [...new Set(all.map((r) => r.asOf.toISOString().slice(0, 10)))];
    const asOf = want && snapshots.includes(want) ? want : snapshots[0];
    const rows = all.filter((r) => r.asOf.toISOString().slice(0, 10) === asOf);

    // El orden de los fondos es el de aparición en la carga, que es el del Excel: así la
    // tabla los lista como los mira el usuario y no en alfabético arbitrario.
    const fondos: string[] = [];
    const holdings: Record<string, number> = {};
    for (const r of rows) {
      if (!fondos.includes(r.fondo)) fondos.push(r.fondo);
      if (r.shares > 0) holdings[holdingKey(r.fondo, r.tickerBBG)] = r.shares;
    }

    const payload: CarterasPayload = {
      asOf, fondos, holdings,
      source: rows.find((r) => r.source)?.source ?? null,
      snapshots,
    };
    return NextResponse.json(payload);
  } catch (err) {
    // Resiliente como el resto de las tablas nuevas de esta vista: si falta el `db push`
    // la tabla simplemente no muestra fondos, en vez de romper Stock Selection entero.
    console.warn("[carteras GET] no disponible:", String(err).slice(0, 160));
    const empty: CarterasPayload = { asOf: null, fondos: [], holdings: {}, source: null, snapshots: [] };
    return NextResponse.json(empty);
  }
}
