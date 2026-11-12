import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { normRecc, reccChanged, tpChanged, thesisChanged, todayIsoSantiago } from "@/lib/reccChange";

// Revisión manual de un modelo: el analista cambia de parecer (recomendación, TP o tesis)
// sin rehacer la planilla. Se crea una versión nueva con fecha de hoy que copia tal cual
// los financials y KPIs de la última versión, así el historial (y el gráfico de TP por
// revisión) registra el cambio con su fecha. Si la última versión ya es de hoy (o
// posterior), se edita esa misma en lugar de duplicarla.
//
// Siempre parte de la ÚLTIMA versión: revisar una vieja crearía una versión de hoy con
// estimaciones desactualizadas que pisaría a la vigente.

export type ModelKind = "company" | "bank";

export interface ReccFields {
  recc:   string | null;
  tp:     number | null;
  thesis: string | null;
}

export interface BaseHeader extends ReccFields {
  updateDate: Date;
  analyst:    string | null;
  link:       string | null;
}

export interface RevisionResult {
  base:       BaseHeader;   // valores ANTES de la revisión
  updateDate: Date;         // fecha de la versión resultante
  created:    boolean;      // true = versión nueva; false = se editó la de hoy
}

export async function latestHeader(kind: ModelKind, ticker: string): Promise<BaseHeader | null> {
  const select = { updateDate: true, recc: true, tp: true, thesis: true, analyst: true, link: true };
  return kind === "company"
    ? prisma.modelHeader.findFirst({ where: { ticker }, orderBy: { updateDate: "desc" }, select })
    : prisma.bankHeader.findFirst({ where: { ticker }, orderBy: { updateDate: "desc" }, select });
}

/** Versión inmediatamente anterior a `before`: contra ella se compara un modelo recién subido. */
export async function previousHeader(kind: ModelKind, ticker: string, before: Date): Promise<BaseHeader | null> {
  const select = { updateDate: true, recc: true, tp: true, thesis: true, analyst: true, link: true };
  const where  = { ticker, updateDate: { lt: before } };
  return kind === "company"
    ? prisma.modelHeader.findFirst({ where, orderBy: { updateDate: "desc" }, select })
    : prisma.bankHeader.findFirst({ where, orderBy: { updateDate: "desc" }, select });
}

export async function reviseModel(
  kind: ModelKind, ticker: string, today: Date, next: ReccFields,
): Promise<RevisionResult | null> {
  const base = await latestHeader(kind, ticker);
  if (!base) return null;

  const key = { ticker, updateDate: base.updateDate };

  // Ya hay versión de hoy → se edita en el lugar.
  if (base.updateDate.getTime() >= today.getTime()) {
    if (kind === "company") await prisma.modelHeader.update({ where: { ticker_updateDate: key }, data: next });
    else                    await prisma.bankHeader.update({ where: { ticker_updateDate: key }, data: next });
    return { base, updateDate: base.updateDate, created: false };
  }

  const newKey = { ticker, updateDate: today };

  await prisma.$transaction(async (tx) => {
    if (kind === "company") {
      const header = await tx.modelHeader.findUniqueOrThrow({ where: { ticker_updateDate: key } });
      const fins   = await tx.modelFinancials.findMany({ where: key });
      // Orden de inserción (= orden de la planilla): el explorer arma las secciones por id.
      const kpis   = await tx.modelKPI.findMany({ where: key, orderBy: { id: "asc" } });

      await tx.modelHeader.create({ data: { ...header, ...newKey, ...next } });
      if (fins.length) await tx.modelFinancials.createMany({ data: fins.map((f) => ({ ...f, ...newKey })) });
      if (kpis.length) await tx.modelKPI.createMany({ data: kpis.map(({ id: _id, ...k }) => ({ ...k, ...newKey })) });
    } else {
      const header = await tx.bankHeader.findUniqueOrThrow({ where: { ticker_updateDate: key } });
      const fins   = await tx.bankFinancials.findMany({ where: key });
      const kpis   = await tx.bankKPI.findMany({ where: key, orderBy: { id: "asc" } });

      await tx.bankHeader.create({ data: { ...header, ...newKey, ...next } });
      if (fins.length) await tx.bankFinancials.createMany({ data: fins.map((f) => ({ ...f, ...newKey })) });
      if (kpis.length) await tx.bankKPI.createMany({ data: kpis.map(({ id: _id, ...k }) => ({ ...k, ...newKey })) });
    }
  }, { timeout: 20_000 });

  return { base, updateDate: today, created: true };
}

// ── PATCH /api/companies/[ticker]/model | bank-model ─────────────────────────────
// Abierto a cualquier usuario autenticado; el aviso de Telegram sale firmado con su nombre.
// Body: { recc, tp, thesis }. Responde { updateDate, created }.

const RECC_MAX = { company: 10, bank: 20 } as const;   // largo de la columna recc

export async function handleRevision(kind: ModelKind, req: NextRequest, ticker: string): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const recc = normRecc(typeof body.recc === "string" ? body.recc : null);
  if (recc && recc.length > RECC_MAX[kind]) {
    return NextResponse.json({ error: "Recomendación demasiado larga" }, { status: 400 });
  }
  const tp = body.tp == null || body.tp === "" ? null : Number(body.tp);
  if (tp !== null && (!isFinite(tp) || tp <= 0)) {
    return NextResponse.json({ error: "Target price inválido" }, { status: 400 });
  }
  const thesis = typeof body.thesis === "string" && body.thesis.trim() ? body.thesis.trim() : null;

  const current = await latestHeader(kind, ticker);
  if (!current) return NextResponse.json({ error: "No hay modelo para este ticker" }, { status: 404 });
  if (!reccChanged(current.recc, recc) && !tpChanged(current.tp, tp) && !thesisChanged(current.thesis, thesis)) {
    return NextResponse.json({ error: "No hay cambios respecto de la última versión" }, { status: 400 });
  }

  try {
    const today = new Date(todayIsoSantiago());
    const res = await reviseModel(kind, ticker, today, { recc, tp, thesis });
    if (!res) return NextResponse.json({ error: "No hay modelo para este ticker" }, { status: 404 });

    notify({
      kind: "model", modelType: kind, ticker, updateDate: res.updateDate,
      recc, tp, thesis, analyst: res.base.analyst, link: res.base.link,
      previous:  { recc: res.base.recc, tp: res.base.tp, thesis: res.base.thesis, updateDate: res.base.updateDate },
      revisedBy: user.name ?? user.email ?? null,
    });

    return NextResponse.json({ updateDate: res.updateDate.toISOString().slice(0, 10), created: res.created });
  } catch (e) {
    console.error(`[${kind} model PATCH]`, e);
    return NextResponse.json({ error: "No se pudo guardar la revisión" }, { status: 500 });
  }
}
