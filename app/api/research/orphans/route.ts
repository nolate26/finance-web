import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export interface OrphanNote {
  id:          number;
  company:     string;   // valor crudo tal como está en la base (puede venir vacío)
  date:        string;
  category:    string;
  title:       string | null;
  subject:     string | null;
  from:        string | null;
  suggestions: { ticker: string; nombre: string }[];
}

/**
 * GET /api/research/orphans  (solo admin)
 *
 * Notas de `email_research` cuyo `company` no existe en `empresas_industrias_v2`.
 * Sin ese match la nota es invisible en el deep-dive, porque el sidebar solo lista
 * tickers de la maestra. Se resuelven asignando el ticker correcto
 * (PATCH /api/research/[id]).
 *
 * El caso simétrico —tickers con modelos o consensus que faltan en la maestra— vive
 * en GET /api/companies/unmapped: ahí no hay nada que asignar, es una alerta.
 */
export async function GET() {
  const deny = await requireAdmin();
  if (deny) return deny;

  try {
    const notes = await prisma.$queryRaw<{
      id: number; company: string; date: Date; category: string;
      title: string | null; subject: string | null; from: string | null;
    }[]>`
      SELECT id, company, date, category, title, subject, "from"
      FROM email_research er
      WHERE NOT EXISTS (
        SELECT 1 FROM empresas_industrias_v2 ei
        WHERE ei.ticker_bloomberg = er.company
      )
      ORDER BY date DESC, id DESC
    `;

    // Sugerencias por raíz del ticker: "FALAB EQUITY" → FALAB CI EQUITY,
    // "WALMEX*:MM EQUITY" → WALMEX* MM EQUITY. Es una ayuda para el admin, no un
    // automatismo: el match siempre lo confirma una persona.
    const universe = await prisma.empresasIndustriasV2.findMany({
      where:  { tickerBloomberg: { not: "" } },
      select: { tickerBloomberg: true, nombreLatam: true },
    });

    function suggest(raw: string): { ticker: string; nombre: string }[] {
      const root = raw.trim().toUpperCase().split(/[\s*:,]/)[0].replace(/\d+$/, "");
      if (root.length < 3) return [];
      return universe
        .filter((u) => {
          const tk = u.tickerBloomberg.toUpperCase();
          return tk.startsWith(root) || u.nombreLatam.toUpperCase().startsWith(root);
        })
        .slice(0, 4)
        .map((u) => ({ ticker: u.tickerBloomberg.toUpperCase(), nombre: u.nombreLatam }));
    }

    const payload: OrphanNote[] = notes.map((n) => ({
      id:          n.id,
      company:     n.company,
      date:        n.date.toISOString().slice(0, 10),
      category:    n.category,
      title:       n.title,
      subject:     n.subject,
      from:        n.from,
      suggestions: suggest(n.company),
    }));

    return NextResponse.json({ notes: payload });
  } catch (err) {
    console.error("Research orphans error:", err);
    return NextResponse.json({ error: "Failed to fetch orphan notes" }, { status: 500 });
  }
}
