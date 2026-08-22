"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Pencil, X, Save, RotateCcw } from "lucide-react";
import type {
  DeltaBlock, DeltaSet, EditBlock, EditSet, CellEdit, ProjectionRowAPI,
} from "@/app/api/projections/route";
import type { CellState, OverridesPayload } from "@/app/api/projections/overrides/route";
import { PATRIA, FONT_SECONDARY, TEXT, BORDER, SURFACE } from "@/lib/patriaTheme";
import { YEAR_METRICS, ROW_YEAR, type YearMetric } from "@/lib/proyeccionOverrideFields";

export type { ProjectionRowAPI as ProjectionRow };

const METRIC_HEADERS = ["Ingresos", "EBITDA", "EBIT", "Utilidad"] as const;
type MetricName = (typeof METRIC_HEADERS)[number];

/** Cabecera visible → clave de la métrica en el payload y en la capa de overrides. */
const METRIC_KEY: Record<MetricName, YearMetric> = {
  Ingresos: "ingresos",
  EBITDA:   "ebitda",
  EBIT:     "ebit",
  Utilidad: "utilidad",
};

// Column indices 0, 1, 2 — always represent globalBaseYear, +1, +2
const COL_INDICES = [0, 1, 2] as const;
const SLOTS = ["y0", "y1", "y2"] as const;

const BORDER_METRIC = "1px solid rgba(32,68,220,0.12)";
const BORDER_LIGHT  = "1px solid rgba(13,13,56,0.05)";

// Ámbar para lo editado a mano — el mismo acento que usa Stock Selection v1.
const EDIT_BG   = "rgba(255,107,6,0.13)";
const EDIT_INK  = PATRIA.orange;

interface Props {
  rows:      ProjectionRowAPI[];
  base_year: number;   // globalBaseYear — anchored to the most-recent snapshot
  prevAt:    string | null;
  /** Se llama tras guardar una edición para que la página recargue los datos. */
  onSaved?:  () => void;
}

// ── Calendar-year resolver ────────────────────────────────────────────────────
//
// Works on both MetricBlock and DeltaBlock (same shape: y0 | y1 | y2 as number|null).
// La API ya re-ancla todas las filas al año base global, así que row.base_year es siempre
// el ancla global y el offset termina siendo el índice de columna. Se mantiene la función
// porque deja el cálculo explícito y sigue siendo correcta si algún día la API dejara de
// re-anclar.

type YBlock = { y0: number | null; y1: number | null; y2: number | null };

function atCalendarYear(
  block: YBlock | null,
  rowBaseYear: number,
  targetCalendarYear: number,
): number | null {
  if (!block) return null;
  const offset = targetCalendarYear - rowBaseYear;
  if (offset === 0) return block.y0;
  if (offset === 1) return block.y1;
  if (offset === 2) return block.y2;
  return null; // year is outside this row's window
}

// ── Date formatting ───────────────────────────────────────────────────────────

const MONTHS_SHORT = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

function fmtLegendDate(s: string): string {
  const [datePart, timePart] = s.split(" ");
  const [y, m, d] = datePart.split("-");
  const mon  = MONTHS_SHORT[parseInt(m, 10) - 1];
  const day  = parseInt(d, 10);
  const hhmm = timePart?.slice(0, 5) ?? "";
  return `${mon} ${day}, ${y}${hhmm ? ` · ${hhmm}` : ""}`;
}

// ── Number formatters ─────────────────────────────────────────────────────────

function fmtVal(v: number): string {
  return Math.round(v).toLocaleString("en-US");
}

/** pool_div viene del Excel a veces como fracción (0,3) y a veces como porcentaje (30). */
function fmtPayout(v: number | null): string | null {
  if (v == null) return null;
  const pct = Math.abs(v) <= 1 ? v * 100 : v;
  return `${pct.toFixed(0)}%`;
}

function fmtDelta(pct: number): string {
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

const numStr = (n: number | null | undefined): string => (n == null ? "" : String(n));

// ── Delta badge ───────────────────────────────────────────────────────────────

type DeltaState = "positive" | "negative" | "neutral";

function classifyDelta(pct: number): DeltaState {
  if (Math.abs(pct) < 0.05) return "neutral";
  return pct > 0 ? "positive" : "negative";
}

const DELTA_STYLE: Record<DeltaState, { bg: string; color: string; icon: string }> = {
  positive: { bg: "rgba(0,30,175,0.10)",  color: "#001EAF", icon: "▲" },
  negative: { bg: "rgba(248,72,94,0.10)", color: "#F8485E", icon: "▼" },
  neutral:  { bg: "rgba(13,13,56,0.10)", color: "rgba(13,13,56,0.62)", icon: "—" },
};

function DeltaBadge({ pct }: { pct: number | null }) {
  if (pct == null) return null;
  const state = classifyDelta(pct);
  const { bg, color, icon } = DELTA_STYLE[state];
  const label = state === "neutral" ? `— ${Math.abs(pct).toFixed(1)}%` : fmtDelta(pct);
  return (
    <span
      style={{
        display: "block",
        marginTop: 2,
        padding: "0px 4px",
        borderRadius: 3,
        fontSize: 9,
        fontWeight: 700,
        fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums",
        lineHeight: "14px",
        background: bg,
        color,
        whiteSpace: "nowrap",
        width: "fit-content",
      }}
    >
      {state === "neutral" ? label : `${icon} ${label}`}
    </span>
  );
}

// ── Tooltip de auditoría ──────────────────────────────────────────────────────

interface HoverInfo { edit: CellEdit; title: string; curr: string; x: number; y: number }

function fmtEditStamp(s: string | null): string {
  if (!s) return "—";
  return fmtLegendDate(s);
}

function EditTooltip({ info }: { info: HoverInfo }) {
  const { edit } = info;
  const prevLabel =
    edit.prev != null ? fmtVal(edit.prev) : edit.prevText ? edit.prevText : "sin valor previo";
  return (
    <div
      style={{
        position: "fixed",
        left: Math.min(info.x + 14, typeof window !== "undefined" ? window.innerWidth - 290 : info.x),
        top: info.y + 16,
        zIndex: 1200,
        pointerEvents: "none",
        width: 272,
        background: PATRIA.white,
        border: `1px solid ${EDIT_INK}`,
        borderRadius: 8,
        boxShadow: "0 8px 28px rgba(13,13,56,0.22)",
        padding: "9px 11px",
      }}
    >
      <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: EDIT_INK, marginBottom: 5 }}>
        Editado a mano · {info.title}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: TEXT.body, marginBottom: 2 }}>
        {edit.by ?? "usuario desconocido"}
      </div>
      <div style={{ fontSize: 10.5, color: TEXT.label, fontFamily: FONT_SECONDARY, marginBottom: 7 }}>
        {fmtEditStamp(edit.at)}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums" }}>
        <span style={{ color: TEXT.muted }}>{prevLabel}</span>
        <span style={{ color: TEXT.disabled }}>→</span>
        <span style={{ color: TEXT.body, fontWeight: 700 }}>{info.curr}</span>
        {edit.pct != null && (
          <span
            style={{
              padding: "0 5px",
              borderRadius: 3,
              fontSize: 10,
              fontWeight: 700,
              background: DELTA_STYLE[classifyDelta(edit.pct)].bg,
              color: DELTA_STYLE[classifyDelta(edit.pct)].color,
            }}
          >
            {fmtDelta(edit.pct)}
          </span>
        )}
      </div>
      <div style={{ fontSize: 10, color: TEXT.disabled, marginTop: 6, lineHeight: 1.45 }}>
        Valor anterior del {fmtEditStamp(edit.prevAt)}
      </div>
    </div>
  );
}

// ── Metric cell — receives pre-resolved calendar values, not raw blocks ───────

function MetricCell({
  value, pct, edit, tdStyle, onHover, hoverTitle,
}: {
  value: number | null;
  pct: number | null;
  edit: CellEdit | null;
  tdStyle: React.CSSProperties;
  onHover: (info: HoverInfo | null) => void;
  hoverTitle: string;
}) {
  const edited = edit != null;
  const style: React.CSSProperties = {
    ...tdStyle,
    verticalAlign: "top",
    padding: "8px 12px",
    textAlign: value === null ? "center" : "right",
    background: edited ? EDIT_BG : tdStyle.background,
    boxShadow: edited ? `inset 2px 0 0 ${EDIT_INK}` : undefined,
    cursor: edited ? "help" : undefined,
  };

  const handlers = edited
    ? {
        onMouseMove: (e: React.MouseEvent) =>
          onHover({
            edit: edit!,
            title: hoverTitle,
            curr: value === null ? "—" : fmtVal(value),
            x: e.clientX,
            y: e.clientY,
          }),
        onMouseLeave: () => onHover(null),
      }
    : {};

  if (value === null) {
    return (
      <td
        className="font-secondary tabular-nums text-xs"
        style={{ ...style, color: TEXT.disabled }}
        {...handlers}
      >
        —
      </td>
    );
  }
  return (
    <td className="font-secondary tabular-nums text-xs" style={style} {...handlers}>
      <span style={{ color: value < 0 ? "#F8485E" : TEXT.body, display: "block", fontWeight: edited ? 700 : 400 }}>
        {fmtVal(value)}
      </span>
      <DeltaBadge pct={pct} />
    </td>
  );
}

// ── Sort helpers ──────────────────────────────────────────────────────────────
//
// Sort keys encode column POSITION (y0=col0, y1=col1, y2=col2), not raw block
// keys. getVal resolves via atCalendarYear so a stale row sorts correctly too.

type SortKey =
  | "empresa" | "sector" | "analyst" | "payout"
  | "ingresos_y0" | "ingresos_y1" | "ingresos_y2"
  | "ebitda_y0"   | "ebitda_y1"   | "ebitda_y2"
  | "ebit_y0"     | "ebit_y1"     | "ebit_y2"
  | "utilidad_y0" | "utilidad_y1" | "utilidad_y2";

interface SortState { key: SortKey; dir: "asc" | "desc" }

// Defined inside the component to capture globalBaseYear
function makeGetVal(globalBaseYear: number) {
  return function getVal(row: ProjectionRowAPI, key: SortKey): number | string | null {
    if (key === "empresa") return row.empresa;
    if (key === "sector")  return row.sector;
    if (key === "analyst") return row.analyst ?? "";
    if (key === "payout")  return row.payout;
    const lastUnder = key.lastIndexOf("_");
    const metric  = key.slice(0, lastUnder) as YearMetric;
    const colIdx  = parseInt(key.slice(lastUnder + 2)); // "y0"→0, "y1"→1, "y2"→2
    const calYear = globalBaseYear + colIdx;
    return atCalendarYear(row[metric], row.base_year, calYear);
  };
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ProjectionsTable({ rows, base_year: globalBaseYear, prevAt, onSaved }: Props) {
  const [sort, setSort] = useState<SortState>({ key: "empresa", dir: "asc" });
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editing, setEditing] = useState<ProjectionRowAPI | null>(null);

  // Editar está abierto a CUALQUIER usuario autenticado (user o admin): el permiso no es
  // de rol, la trazabilidad la da la firma en la bitácora.
  const { status } = useSession();
  const canEdit = status === "authenticated";

  const getVal = makeGetVal(globalBaseYear);

  // Column headers are strictly anchored to the global (most-recent) base year
  const yearLabels = COL_INDICES.map((i) => `${globalBaseYear + i}E`);

  const hasDeltaData = rows.some((r) => r.delta !== null);
  const editedRows   = rows.filter((r) => r.edits !== null).length;
  const supersededTotal = rows.reduce((s, r) => s + r.supersededEdits, 0);

  function toggleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "empresa" || key === "sector" || key === "analyst" ? "asc" : "desc" }
    );
  }

  function SortIcon({ colKey }: { colKey: SortKey }) {
    if (sort.key !== colKey)
      return <span style={{ opacity: 0.25, marginLeft: 2, fontSize: 8 }}>⇅</span>;
    return (
      <span style={{ color: "#2044DC", marginLeft: 2, fontSize: 8 }}>
        {sort.dir === "asc" ? "↑" : "↓"}
      </span>
    );
  }

  const sorted = [...rows].sort((a, b) => {
    const av = getVal(a, sort.key);
    const bv = getVal(b, sort.key);
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    const cmp =
      typeof av === "string" && typeof bv === "string"
        ? av.localeCompare(bv)
        : (av as number) - (bv as number);
    return sort.dir === "asc" ? cmp : -cmp;
  });

  function thStyle(active: boolean): React.CSSProperties {
    return {
      cursor: "pointer",
      userSelect: "none",
      color: active ? "#2044DC" : "rgba(13,13,56,0.62)",
      background: active ? "rgba(32,68,220,0.06)" : undefined,
    };
  }

  // For a given row × metric × column index, resolve value, delta and edit signature
  // by calendar year so stale rows are automatically "shifted" visually.
  function resolveCell(
    row: ProjectionRowAPI,
    metric: YearMetric,
    colIdx: number,
  ): { value: number | null; pct: number | null; edit: CellEdit | null } {
    const calYear    = globalBaseYear + colIdx;
    const value      = atCalendarYear(row[metric],              row.base_year, calYear);
    const deltaBlock = row.delta ? (row.delta[metric as keyof DeltaSet] as DeltaBlock | null) : null;
    const pct        = atCalendarYear(deltaBlock,               row.base_year, calYear);
    const editBlock  = row.edits ? (row.edits[metric as keyof EditSet] as EditBlock | null) : null;
    const edit       = editBlock ? editBlock[SLOTS[colIdx]] : null;
    return { value, pct, edit };
  }

  return (
    <div className="card overflow-hidden">

      {/* ── Barra de acciones ─────────────────────────────────────────────── */}
      <div
        style={{
          padding: "8px 16px",
          borderBottom: BORDER_LIGHT,
          display: "flex",
          alignItems: "center",
          gap: 12,
          background: SURFACE.card,
        }}
      >
        <span style={{ fontSize: 11, color: TEXT.label, fontWeight: 600 }}>
          {rows.length} empresas
        </span>
        {editedRows > 0 && (
          <span
            style={{
              fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 4,
              background: EDIT_BG, color: EDIT_INK,
            }}
          >
            {editedRows} con ediciones manuales
          </span>
        )}
        {supersededTotal > 0 && (
          <span
            style={{ fontSize: 10, color: TEXT.muted }}
            title="Ediciones anteriores al último reporte del Excel. Siguen en la bitácora, pero ya no se aplican: manda la foto más fresca."
          >
            {supersededTotal} edición{supersededTotal === 1 ? "" : "es"} reemplazada{supersededTotal === 1 ? "" : "s"} por el Excel
          </span>
        )}
        <div style={{ marginLeft: "auto" }}>
          {canEdit ? (
            <button
              onClick={() => setEditMode((e) => !e)}
              title="Clic en el nombre de una empresa para editar toda su fila"
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "5px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                border: `1px solid ${editMode ? EDIT_INK : BORDER.strong}`,
                background: editMode ? EDIT_BG : SURFACE.card,
                color: editMode ? EDIT_INK : TEXT.label,
                cursor: "pointer",
              }}
            >
              <Pencil size={13} /> {editMode ? "Edición activa" : "Editar"}
            </button>
          ) : (
            <span style={{ fontSize: 11, color: TEXT.disabled }}>Iniciá sesión para editar</span>
          )}
        </div>
      </div>

      {/* ── Legend ────────────────────────────────────────────────────────── */}
      {hasDeltaData && prevAt && (
        <div
          style={{
            padding: "7px 16px 6px",
            borderBottom: BORDER_LIGHT,
            display: "flex",
            alignItems: "center",
            gap: 18,
            flexWrap: "wrap",
            fontSize: 10,
            color: "rgba(13,13,56,0.45)",
            fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums",
            background: "rgba(13,13,56,0.022)",
          }}
        >
          <span style={{ fontWeight: 600, color: "rgba(13,13,56,0.62)" }}>
            Δ vs. reporte del {fmtLegendDate(prevAt)}
          </span>
          <span style={{ color: "rgba(13,13,56,0.28)" }}>·</span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ background: "rgba(0,30,175,0.10)", color: "#001EAF", fontWeight: 700, padding: "0 4px", borderRadius: 3 }}>
              ▲ +%
            </span>
            upward revision
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ background: "rgba(248,72,94,0.10)", color: "#F8485E", fontWeight: 700, padding: "0 4px", borderRadius: 3 }}>
              ▼ −%
            </span>
            downward revision
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ background: "rgba(13,13,56,0.10)", color: "rgba(13,13,56,0.62)", fontWeight: 700, padding: "0 4px", borderRadius: 3 }}>
              — 0%
            </span>
            no change
          </span>
          <span style={{ color: "rgba(13,13,56,0.28)" }}>·</span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ background: EDIT_BG, color: EDIT_INK, fontWeight: 700, padding: "0 4px", borderRadius: 3 }}>
              ámbar
            </span>
            editado a mano — pasá por encima para ver quién y cuándo
          </span>
        </div>
      )}

      <div className="overflow-x-auto">
        <table
          className="w-full text-xs whitespace-nowrap"
          style={{ borderCollapse: "collapse" }}
        >
          <thead>
            {/* Row 1 — metric group headers */}
            <tr style={{ background: "#F5F7FD" }}>
              <th
                colSpan={5}
                className="px-4 py-2 text-left text-[10px] font-bold tracking-widest uppercase"
                style={{ color: "rgba(13,13,56,0.62)", borderBottom: BORDER_METRIC, borderRight: BORDER_METRIC }}
              >
                Company Info
              </th>
              {METRIC_HEADERS.map((m) => (
                <th
                  key={m}
                  colSpan={3}
                  className="px-4 py-2 text-center text-[10px] font-bold tracking-widest uppercase"
                  style={{ color: "#2044DC", borderBottom: BORDER_METRIC, borderRight: BORDER_METRIC }}
                >
                  {m}
                </th>
              ))}
            </tr>
            {/* Row 2 — year column headers (strictly globalBaseYear anchored) */}
            <tr style={{ background: "#F5F7FD" }}>
              <th
                className="px-4 py-2 text-left font-medium"
                style={{ ...thStyle(sort.key === "empresa"), borderBottom: BORDER_LIGHT }}
                onClick={() => toggleSort("empresa")}
              >
                Empresa <SortIcon colKey="empresa" />
              </th>
              <th
                className="px-3 py-2 text-left font-medium"
                style={{ ...thStyle(sort.key === "sector"), borderBottom: BORDER_LIGHT }}
                onClick={() => toggleSort("sector")}
              >
                Sector <SortIcon colKey="sector" />
              </th>
              <th
                className="px-3 py-2 text-left font-medium"
                style={{ ...thStyle(sort.key === "analyst"), borderBottom: BORDER_LIGHT }}
                onClick={() => toggleSort("analyst")}
              >
                Analista <SortIcon colKey="analyst" />
              </th>
              <th
                className="px-3 py-2 text-right font-medium"
                style={{ ...thStyle(sort.key === "payout"), borderBottom: BORDER_LIGHT }}
                onClick={() => toggleSort("payout")}
                title="Política de dividendos (payout) — columna pool_div del Excel"
              >
                Payout <SortIcon colKey="payout" />
              </th>
              <th
                className="px-3 py-2 text-left font-medium"
                style={{ color: "rgba(13,13,56,0.62)", borderBottom: BORDER_LIGHT, borderRight: BORDER_METRIC }}
              >
                Mon.
              </th>
              {METRIC_HEADERS.map((m) =>
                COL_INDICES.map((ci) => {
                  const sortKey = `${METRIC_KEY[m]}_y${ci}` as SortKey;
                  return (
                    <th
                      key={`${m}-${ci}`}
                      className="px-3 py-2 text-right font-medium"
                      style={{
                        ...thStyle(sort.key === sortKey),
                        borderBottom: BORDER_LIGHT,
                        borderRight: ci === 2 ? BORDER_METRIC : undefined,
                      }}
                      onClick={() => toggleSort(sortKey)}
                    >
                      {yearLabels[ci]} <SortIcon colKey={sortKey} />
                    </th>
                  );
                })
              )}
            </tr>
          </thead>

          <tbody>
            {sorted.map((row, i) => {
              // Badge to signal that this row's data was shifted (stale base_year)
              const isStale  = row.sourceBaseYear < globalBaseYear;
              const nEdits   = row.edits
                ? [row.edits.ingresos, row.edits.ebitda, row.edits.ebit, row.edits.utilidad]
                    .reduce((s, b) => s + (b ? [b.y0, b.y1, b.y2].filter(Boolean).length : 0), 0)
                  + [row.edits.moneda, row.edits.analyst, row.edits.pool_div].filter(Boolean).length
                : 0;

              return (
                <tr
                  key={i}
                  className="transition-colors"
                  style={{ borderBottom: BORDER_LIGHT }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLElement).style.background = "rgba(32,68,220,0.03)")
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLElement).style.background = "transparent")
                  }
                >
                  {/* Company name */}
                  <td className="px-4 py-2 font-medium" style={{ color: TEXT.body, verticalAlign: "top" }}>
                    <span
                      onClick={editMode ? () => setEditing(row) : undefined}
                      title={editMode ? "Editar toda la fila de esta empresa" : undefined}
                      style={
                        editMode
                          ? { cursor: "pointer", color: EDIT_INK, textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: 3 }
                          : undefined
                      }
                    >
                      {row.empresa}
                    </span>
                    {nEdits > 0 && (
                      <span
                        title={`${nEdits} valor(es) editado(s) a mano en esta fila`}
                        style={{
                          marginLeft: 6, padding: "1px 5px", borderRadius: 4,
                          fontSize: 9, fontWeight: 700, background: EDIT_BG, color: EDIT_INK,
                          fontFamily: FONT_SECONDARY,
                        }}
                      >
                        {nEdits} ed.
                      </span>
                    )}
                    {isStale && (
                      <span
                        title={`Data anchored to base year ${row.sourceBaseYear}; shifted to align with ${globalBaseYear}E columns`}
                        style={{
                          marginLeft: 6,
                          padding: "1px 5px",
                          borderRadius: 4,
                          fontSize: 9,
                          fontWeight: 600,
                          background: "rgba(13,13,56,0.07)",
                          color: TEXT.muted,
                          fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums",
                          cursor: "default",
                        }}
                      >
                        base {row.sourceBaseYear}
                      </span>
                    )}
                  </td>

                  <td className="px-3 py-2" style={{ color: TEXT.label, verticalAlign: "top" }}>
                    {row.sector || "—"}
                  </td>

                  {/* Analista — editable, con firma */}
                  <RowFieldCell
                    text={row.analyst}
                    edit={row.edits?.analyst ?? null}
                    hoverTitle="Analista"
                    onHover={setHover}
                    align="left"
                  />

                  {/* Payout (pool_div) */}
                  <RowFieldCell
                    text={fmtPayout(row.payout)}
                    edit={row.edits?.pool_div ?? null}
                    hoverTitle="Payout"
                    onHover={setHover}
                    align="right"
                  />

                  {/* Moneda */}
                  <RowFieldCell
                    text={row.moneda || "—"}
                    edit={row.edits?.moneda ?? null}
                    hoverTitle="Moneda"
                    onHover={setHover}
                    align="left"
                    borderRight={BORDER_METRIC}
                  />

                  {/* Las 4 métricas × 3 años */}
                  {METRIC_HEADERS.map((m, mi) =>
                    COL_INDICES.map((ci) => {
                      const metric = METRIC_KEY[m];
                      const { value, pct, edit } = resolveCell(row, metric, ci);
                      return (
                        <MetricCell
                          key={`${metric}-${ci}`}
                          value={value}
                          pct={pct}
                          edit={edit}
                          hoverTitle={`${m} ${globalBaseYear + ci}E`}
                          onHover={setHover}
                          tdStyle={{
                            borderLeft: ci === 0 ? "2px solid rgba(13,13,56,0.10)" : undefined,
                            borderRight: ci === 2 ? BORDER_METRIC : undefined,
                            background: mi % 2 === 1 ? "#F5F7FD" : undefined,
                          }}
                        />
                      );
                    })
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {hover && <EditTooltip info={hover} />}

      {editing && (
        <ProjectionRowEditor
          row={editing}
          globalBaseYear={globalBaseYear}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); onSaved?.(); }}
        />
      )}
    </div>
  );
}

// ── Celda de campo de fila (analista / payout / moneda) ───────────────────────

function RowFieldCell({
  text, edit, hoverTitle, onHover, align, borderRight,
}: {
  text: string | null;
  edit: CellEdit | null;
  hoverTitle: string;
  onHover: (info: HoverInfo | null) => void;
  align: "left" | "right";
  borderRight?: string;
}) {
  const edited = edit != null;
  return (
    <td
      className="px-3 py-2 font-secondary"
      style={{
        color: text ? TEXT.label : TEXT.disabled,
        verticalAlign: "top",
        textAlign: align,
        borderRight,
        background: edited ? EDIT_BG : undefined,
        boxShadow: edited ? `inset 2px 0 0 ${EDIT_INK}` : undefined,
        fontWeight: edited ? 700 : undefined,
        cursor: edited ? "help" : undefined,
      }}
      onMouseMove={edited ? (e) => onHover({ edit: edit!, title: hoverTitle, curr: text ?? "—", x: e.clientX, y: e.clientY }) : undefined}
      onMouseLeave={edited ? () => onHover(null) : undefined}
    >
      {text || "—"}
    </td>
  );
}

// ── Panel de edición de una fila ──────────────────────────────────────────────
//
// Guarda la fila entera en un solo PUT. Vaciar un campo borra la edición y la celda
// vuelve al valor del Excel. Se editan exactamente las columnas que la tabla muestra
// (las 3 del ancla global) aunque el snapshot de esa empresa no las cubra: ése es el
// caso de "tapar un bache" de una fila con base_year viejo.

function ProjectionRowEditor({
  row, globalBaseYear, onClose, onSaved,
}: {
  row: ProjectionRowAPI;
  globalBaseYear: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [state, setState]   = useState<OverridesPayload | null>(null);
  const [edits, setEdits]   = useState<Record<string, string>>({});
  const [initial, setInit]  = useState<Record<string, string>>({});
  const [loading, setLoad]  = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const columns = useMemo(
    () => [globalBaseYear, globalBaseYear + 1, globalBaseYear + 2],
    [globalBaseYear],
  );

  useEffect(() => {
    let alive = true;
    fetch(`/api/projections/overrides?empresa=${encodeURIComponent(row.empresa)}`)
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error || "Error"); return d as OverridesPayload; })
      .then((d) => {
        if (!alive) return;
        const map: Record<string, string> = {};
        for (const c of d.cells) {
          const k = `${c.metric}|${c.calendarYear}`;
          // Valor mostrado = edición vigente, si no el del Excel.
          const eff = c.applied
            ? (c.overrideText ?? numStr(c.override))
            : (c.excelText ?? numStr(c.excel));
          map[k] = eff ?? "";
        }
        setState(d); setEdits(map); setInit(map); setLoad(false);
      })
      .catch((e: Error) => { if (alive) { setError(e.message); setLoad(false); } });
    return () => { alive = false; };
  }, [row.empresa]);

  const cellOf = (metric: string, year: number): CellState | null =>
    state?.cells.find((c) => c.metric === metric && c.calendarYear === year) ?? null;

  const changes = useMemo(() => {
    const out: { metric: string; calendarYear: number; value?: number | null; text?: string | null }[] = [];
    for (const k of Object.keys(edits)) {
      const cur = (edits[k] ?? "").trim(), init = (initial[k] ?? "").trim();
      if (cur === init) continue;
      const [metric, yearStr] = k.split("|");
      const calendarYear = parseInt(yearStr, 10);
      if (metric === "moneda" || metric === "analyst") {
        out.push({ metric, calendarYear: ROW_YEAR, text: cur === "" ? null : cur });
      } else {
        if (cur === "") { out.push({ metric, calendarYear, value: null }); continue; }
        const v = Number(cur.replace(/\./g, "").replace(",", "."));
        if (Number.isFinite(v)) out.push({ metric, calendarYear, value: v });
      }
    }
    return out;
  }, [edits, initial]);

  const save = () => {
    if (!changes.length || saving) return;
    setSaving(true); setError(null);
    fetch("/api/projections/overrides", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ empresa: row.empresa, changes }),
    })
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error || "Error al guardar"); return d; })
      .then(() => onSaved())
      .catch((e: Error) => { setError(e.message); setSaving(false); });
  };

  const inputStyle = (edited: boolean): React.CSSProperties => ({
    width: "100%",
    padding: "5px 8px",
    fontSize: 12,
    fontFamily: FONT_SECONDARY,
    fontVariantNumeric: "tabular-nums",
    textAlign: "right",
    borderRadius: 6,
    border: `1px solid ${edited ? EDIT_INK : BORDER.strong}`,
    background: edited ? EDIT_BG : PATRIA.white,
    color: TEXT.body,
    outline: "none",
  });

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(13,13,56,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: PATRIA.white, borderRadius: 12, width: "min(620px, 96vw)", maxHeight: "92vh", display: "flex", flexDirection: "column", boxShadow: "0 12px 48px rgba(13,13,56,0.35)", overflow: "hidden" }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "13px 16px", background: EDIT_INK, color: PATRIA.white }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <Pencil size={15} />
            <span style={{ fontSize: 14, fontWeight: 700 }}>Editar proyecciones · {row.empresa}</span>
            <span style={{ fontSize: 11, opacity: 0.9 }}>{row.moneda || "—"} · millones</span>
          </div>
          <button onClick={onClose} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 6, border: "1px solid rgba(255,255,255,0.3)", background: "transparent", color: PATRIA.white, cursor: "pointer" }}>
            <X size={15} />
          </button>
        </div>

        <div style={{ overflow: "auto", flex: 1, padding: "10px 16px 14px" }}>
          {loading && <div style={{ padding: 24, textAlign: "center", fontSize: 12, color: TEXT.label }}>Cargando…</div>}

          {!loading && state && (
            <>
              {/* Métricas por año */}
              <div style={{ display: "grid", gridTemplateColumns: "110px repeat(3, 1fr)", gap: 6, alignItems: "center" }}>
                <div />
                {columns.map((y) => (
                  <div key={y} style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", textAlign: "center", color: TEXT.label }}>
                    {y}E
                  </div>
                ))}
                {YEAR_METRICS.map((metric) => (
                  <ProjEditorMetricRow
                    key={metric}
                    metric={metric}
                    columns={columns}
                    edits={edits}
                    setEdits={setEdits}
                    cellOf={cellOf}
                    inputStyle={inputStyle}
                  />
                ))}
              </div>

              {/* Ficha */}
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: TEXT.label, margin: "16px 0 6px" }}>
                Ficha
              </div>
              {([
                { key: "moneda",   label: "Moneda",       kind: "text" as const },
                { key: "analyst",  label: "Analista",     kind: "text" as const },
                { key: "pool_div", label: "Payout (div.)",kind: "number" as const },
              ]).map((f) => {
                const k = `${f.key}|${ROW_YEAR}`;
                const c = cellOf(f.key, ROW_YEAR);
                const edited = c?.applied ?? false;
                const excel = c?.excelText ?? numStr(c?.excel);
                return (
                  <div key={f.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0" }}>
                    <div style={{ flex: 1, fontSize: 12, color: TEXT.body }}>
                      {f.label}
                      <span style={{ fontSize: 10, color: TEXT.disabled, marginLeft: 6 }}>
                        Excel: {excel || "—"}
                      </span>
                    </div>
                    <input
                      value={edits[k] ?? ""}
                      onChange={(e) => setEdits((p) => ({ ...p, [k]: e.target.value }))}
                      placeholder="—"
                      inputMode={f.kind === "number" ? "decimal" : undefined}
                      style={{ ...inputStyle(edited), width: 150, textAlign: f.kind === "number" ? "right" : "left" }}
                    />
                    <button
                      onClick={() => setEdits((p) => ({ ...p, [k]: "" }))}
                      title="Vaciar → vuelve al valor del Excel"
                      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: 6, border: `1px solid ${BORDER.base}`, background: PATRIA.white, color: (edits[k] ?? "") === "" ? TEXT.disabled : EDIT_INK, cursor: "pointer" }}
                    >
                      <RotateCcw size={13} />
                    </button>
                  </div>
                );
              })}

              <div style={{ fontSize: 10.5, color: TEXT.disabled, marginTop: 14, lineHeight: 1.5 }}>
                Valores en la moneda reportada, en millones. Vaciar un campo borra la edición y la
                celda vuelve al valor del Excel. Los cambios no tocan <code>proyecciones_financieras</code>:
                viven en una capa aparte, firmada con tu usuario y registrada en la bitácora.
                Si el script del Excel se vuelve a correr <b>después</b> de esta edición, manda el
                Excel (la foto más fresca) y esta edición deja de aplicarse.
              </div>
            </>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, padding: "10px 16px", borderTop: `1px solid ${BORDER.base}`, background: SURFACE.subtle }}>
          {error && <span style={{ fontSize: 12, color: "#F8485E", fontWeight: 600, marginRight: "auto" }}>{error}</span>}
          <span style={{ fontSize: 12, color: changes.length ? EDIT_INK : TEXT.disabled, fontWeight: 600, fontFamily: FONT_SECONDARY }}>
            {changes.length ? `${changes.length} sin guardar` : "sin cambios"}
          </span>
          <button onClick={onClose} style={{ padding: "7px 14px", borderRadius: 6, fontSize: 12.5, fontWeight: 600, border: `1px solid ${BORDER.base}`, background: PATRIA.white, color: TEXT.label, cursor: "pointer" }}>
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={!changes.length || saving}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 16px", borderRadius: 6, fontSize: 12.5, fontWeight: 600, border: "none", cursor: changes.length && !saving ? "pointer" : "default", color: PATRIA.white, background: changes.length ? EDIT_INK : TEXT.muted, opacity: saving ? 0.7 : 1 }}
          >
            <Save size={13} /> {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProjEditorMetricRow({
  metric, columns, edits, setEdits, cellOf, inputStyle,
}: {
  metric: YearMetric;
  columns: number[];
  edits: Record<string, string>;
  setEdits: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  cellOf: (metric: string, year: number) => CellState | null;
  inputStyle: (edited: boolean) => React.CSSProperties;
}) {
  const LABEL: Record<YearMetric, string> = {
    ingresos: "Ingresos", ebitda: "EBITDA", ebit: "EBIT", utilidad: "Utilidad",
  };
  return (
    <>
      <div style={{ fontSize: 12, color: TEXT.body, fontWeight: 600 }}>{LABEL[metric]}</div>
      {columns.map((y) => {
        const k = `${metric}|${y}`;
        const c = cellOf(metric, y);
        const isOverride = c?.applied ?? false;
        return (
          <div key={y}>
            <input
              value={edits[k] ?? ""}
              inputMode="decimal"
              onChange={(e) => setEdits((p) => ({ ...p, [k]: e.target.value }))}
              placeholder="—"
              style={inputStyle(isOverride)}
            />
            {isOverride && (
              <div style={{ fontSize: 9, color: TEXT.disabled, textAlign: "right", marginTop: 1 }}>
                Excel: {c?.excel == null ? "—" : fmtVal(c.excel)}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
