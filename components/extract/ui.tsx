"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, CheckSquare, Square } from "lucide-react";
import type { ExtractUniversePayload, ExtractCompany } from "@/app/api/extract/universe/route";
import { FONT_SECONDARY, PATRIA, TEXT, BORDER, SURFACE } from "@/lib/patriaTheme";
import { countryName } from "@/lib/countryNames";

// Piezas compartidas por las dos pestañas de Extract Data: universo de empresas
// (con modelo), tarjeta de filtro, chips multi-selección, lista de tickers con
// buscador y "Select all", y la tabla de resultados. Mismos tokens que el resto de
// la plataforma (Estimates / LatAm).

// ── Universo ──────────────────────────────────────────────────────────────────

export function useExtractUniverse() {
  const [data,    setData]    = useState<ExtractUniversePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/extract/universe")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: ExtractUniversePayload) => setData(d))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);
  return { universe: data, loading, error };
}

// ── Estilos ───────────────────────────────────────────────────────────────────

export const CONTROL: React.CSSProperties = {
  padding: "7px 11px", borderRadius: 7,
  background: SURFACE.subtle, border: `1px solid ${BORDER.base}`,
  color: TEXT.body, fontSize: 13, outline: "none", fontFamily: FONT_SECONDARY,
};

export const PRIMARY_BTN: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 7,
  padding: "8px 18px", borderRadius: 8, border: "none", cursor: "pointer",
  background: PATRIA.kingBlue, color: "#fff", fontSize: 13, fontWeight: 700,
  boxShadow: `0 1px 3px ${PATRIA.kingBlue}55`,
};

export const GHOST_BTN: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 5,
  padding: "5px 11px", borderRadius: 7, cursor: "pointer",
  background: "#fff", border: `1px solid ${BORDER.strong}`,
  color: TEXT.label, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
};

export function FilterCard({ title, hint, children, style }: { title: string; hint?: React.ReactNode; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="card" style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8, minWidth: 0, ...style }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: PATRIA.kingBlue }}>{title}</span>
        {hint && <span style={{ fontSize: 11, color: TEXT.muted, fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums" }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

// ── Chips multi-selección ─────────────────────────────────────────────────────

export function ChipGroup<T extends string | number>({
  options, selected, onToggle, onAll, onNone, labelOf,
}: {
  options:  T[];
  selected: Set<T>;
  onToggle: (v: T) => void;
  onAll?:   () => void;
  onNone?:  () => void;
  labelOf?: (v: T) => string;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center" }}>
      {options.map((o) => {
        const on = selected.has(o);
        return (
          <button
            key={String(o)}
            type="button"
            onClick={() => onToggle(o)}
            style={{
              padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
              border: `1px solid ${on ? PATRIA.kingBlue : BORDER.strong}`,
              background: on ? "rgba(32,68,220,0.10)" : "#fff",
              color: on ? PATRIA.blue : TEXT.label,
            }}
          >
            {labelOf ? labelOf(o) : String(o)}
          </button>
        );
      })}
      {(onAll || onNone) && (
        <span style={{ display: "inline-flex", gap: 8, marginLeft: 4, fontSize: 11 }}>
          {onAll  && <button type="button" onClick={onAll}  style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: PATRIA.kingBlue, fontWeight: 600 }}>all</button>}
          {onNone && <button type="button" onClick={onNone} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: TEXT.muted, fontWeight: 600 }}>none</button>}
        </span>
      )}
    </div>
  );
}

// ── Lista de tickers con buscador + select all ────────────────────────────────

export function TickerPicker({
  candidates, selected, onChange, maxHeight = 260,
}: {
  candidates: ExtractCompany[];      // ya filtrados por país / sector / tipo
  selected:   Set<string>;
  onChange:   (next: Set<string>) => void;
  maxHeight?: number;
}) {
  const [q, setQ] = useState("");
  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? candidates.filter((c) => c.name.toLowerCase().includes(s) || c.ticker.toLowerCase().includes(s)) : candidates;
  }, [candidates, q]);

  const selectedVisible = visible.filter((c) => selected.has(c.ticker)).length;
  const allVisibleOn    = visible.length > 0 && selectedVisible === visible.length;

  function toggle(t: string) {
    const next = new Set(selected);
    if (next.has(t)) next.delete(t); else next.add(t);
    onChange(next);
  }
  function selectVisible(on: boolean) {
    const next = new Set(selected);
    for (const c of visible) { if (on) next.add(c.ticker); else next.delete(c.ticker); }
    onChange(next);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, ...CONTROL, padding: "5px 9px", flex: "1 1 180px", minWidth: 0 }}>
          <Search size={13} style={{ color: TEXT.muted, flexShrink: 0 }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Company or ticker…"
            style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", fontSize: 12, color: TEXT.body, fontFamily: FONT_SECONDARY }} />
        </div>
        <button type="button" onClick={() => selectVisible(!allVisibleOn)} style={GHOST_BTN}>
          {allVisibleOn ? <CheckSquare size={12} /> : <Square size={12} />}
          {allVisibleOn ? "Clear" : "Select all"} ({visible.length})
        </button>
      </div>

      <div style={{ maxHeight, overflowY: "auto", border: `1px solid ${BORDER.base}`, borderRadius: 8, background: "#fff" }}>
        {visible.length === 0 && (
          <div style={{ padding: 14, fontSize: 12, color: TEXT.muted, textAlign: "center" }}>No companies match.</div>
        )}
        {visible.map((c) => {
          const on = selected.has(c.ticker);
          return (
            <label key={c.ticker} style={{ display: "flex", alignItems: "center", gap: 9, padding: "5px 10px", cursor: "pointer", borderBottom: `1px solid ${BORDER.subtle}`, background: on ? "rgba(32,68,220,0.04)" : "transparent" }}>
              <input type="checkbox" checked={on} onChange={() => toggle(c.ticker)} style={{ accentColor: PATRIA.kingBlue }} />
              <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: TEXT.body, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                <span style={{ fontSize: 10, color: TEXT.muted, fontFamily: FONT_SECONDARY }}>
                  {c.ticker}{c.country ? ` · ${countryName(c.country)}` : ""}{c.industry ? ` · ${c.industry}` : ""}
                </span>
              </span>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", padding: "1px 6px", borderRadius: 4,
                background: c.kind === "bank" ? "rgba(255,107,6,0.10)" : "rgba(32,68,220,0.08)", color: c.kind === "bank" ? PATRIA.orange : PATRIA.kingBlue }}>
                {c.kind}
              </span>
            </label>
          );
        })}
      </div>
      <span style={{ fontSize: 11, color: TEXT.muted, fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums" }}>
        {selected.size} selected
      </span>
    </div>
  );
}

// ── Tabla de resultados ───────────────────────────────────────────────────────

export interface ResultColumn {
  key:     string;
  label:   string;
  align?:  "left" | "right" | "center";
  /** Cabecera de grupo (segunda fila de encabezado). Columnas contiguas con el mismo grupo se fusionan. */
  group?:  string;
  sticky?: boolean;
  render?: (v: unknown) => { text: string; color?: string; weight?: number };
}

export function fmtAbs(v: number | null): string {
  if (v == null) return "—";
  return v.toLocaleString("en-US", { maximumFractionDigits: 1 });
}
export function fmtSmall(v: number | null): string {
  if (v == null) return "—";
  return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export function fmtPct(v: number | null, signed = false): string {
  if (v == null) return "—";
  return (signed && v > 0 ? "+" : "") + v.toFixed(1) + "%";
}
export function fmtMult(v: number | null): string {
  if (v == null) return "—";
  return v.toFixed(1) + "x";
}

const HDR_BG = PATRIA.blue;
const RULE   = "rgba(13,13,56,0.20)";

export function ResultTable({ columns, rows, emptyText = "No data for this selection." }: {
  columns:    ResultColumn[];
  rows:       Record<string, unknown>[];
  emptyText?: string;
}) {
  // Grupos de encabezado: corridas contiguas con el mismo `group`.
  const groups: { label: string; span: number }[] = [];
  for (const c of columns) {
    const g = c.group ?? "";
    const last = groups[groups.length - 1];
    if (last && last.label === g) last.span++; else groups.push({ label: g, span: 1 });
  }
  const hasGroups = groups.some((g) => g.label !== "");

  return (
    <div className="scroll-x" style={{ borderRadius: 10, border: `1px solid ${RULE}`, boxShadow: "0 1px 6px rgba(13,13,56,0.07)", background: "#fff" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
        <thead>
          {hasGroups && (
            <tr>
              {groups.map((g, i) => (
                <th key={i} colSpan={g.span} style={{ background: g.label ? PATRIA.darkBlue : HDR_BG, color: "#fff", padding: "6px 10px", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", textAlign: "center", borderRight: "1px solid rgba(255,255,255,0.18)" }}>
                  {g.label}
                </th>
              ))}
            </tr>
          )}
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={{
                background: HDR_BG, color: "#fff", padding: "7px 10px", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.04em",
                textTransform: "uppercase", textAlign: c.align ?? "right", whiteSpace: "nowrap",
                borderRight: "1px solid rgba(255,255,255,0.18)",
                position: c.sticky ? "sticky" : undefined, left: c.sticky ? 0 : undefined, zIndex: c.sticky ? 3 : undefined,
              }}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={columns.length} style={{ padding: 28, textAlign: "center", color: TEXT.muted, fontSize: 13 }}>{emptyText}</td></tr>
          )}
          {rows.map((r, i) => {
            const bg = i % 2 === 0 ? "#fff" : SURFACE.subtle;
            return (
              <tr key={i} style={{ background: bg }}>
                {columns.map((c) => {
                  const raw = r[c.key];
                  const out = c.render ? c.render(raw) : { text: raw == null ? "—" : String(raw) };
                  return (
                    <td key={c.key} style={{
                      padding: "5px 10px", whiteSpace: "nowrap", textAlign: c.align ?? "right",
                      fontFamily: c.align === "left" ? undefined : FONT_SECONDARY, fontVariantNumeric: "tabular-nums",
                      color: out.color ?? (raw == null ? TEXT.muted : TEXT.body), fontWeight: out.weight ?? (c.sticky ? 600 : 400),
                      borderRight: `1px solid ${BORDER.subtle}`, borderBottom: `1px solid ${BORDER.subtle}`,
                      position: c.sticky ? "sticky" : undefined, left: c.sticky ? 0 : undefined, background: c.sticky ? bg : undefined, zIndex: c.sticky ? 1 : undefined,
                    }}>
                      {out.text}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
