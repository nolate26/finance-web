"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, X, Search, Loader2 } from "lucide-react";
import { FONT_SECONDARY, TEXT, BORDER, PATRIA } from "@/lib/patriaTheme";
import type { UniverseItem } from "@/app/api/analysis/universe/route";

// Buscador de empresas comparables para superponer en el gráfico de valuación.
//
// El universo se pide con ?withValuation=1: de las 682 empresas del maestro sólo 383
// tienen serie histórica, y ofrecer las otras sólo produce líneas vacías.

export const MAX_COMPARABLES = 2;   // 3 líneas en total con la empresa base

export interface Comparable {
  ticker:  string;
  name:    string;
  color:   string;
  loading: boolean;
}

interface Props {
  /** Ticker de la empresa base: se excluye de los resultados. */
  baseTicker: string;
  selected:   Comparable[];
  onAdd:      (item: UniverseItem) => void;
  onRemove:   (ticker: string) => void;
}

export default function ComparablePicker({ baseTicker, selected, onAdd, onRemove }: Props) {
  const [universe, setUniverse] = useState<UniverseItem[]>([]);
  const [loaded, setLoaded]     = useState(false);
  const [open, setOpen]         = useState(false);
  const [query, setQuery]       = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const full = selected.length >= MAX_COMPARABLES;

  // El universo se carga la primera vez que se abre el panel, no al montar el
  // gráfico: la mayoría de las visitas a Company Info nunca comparan nada.
  useEffect(() => {
    if (!open || loaded) return;
    fetch("/api/analysis/universe?withValuation=1")
      .then((r) => (r.ok ? r.json() : { companies: [] }))
      .then((d: { companies?: UniverseItem[] }) => setUniverse(d.companies ?? []))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [open, loaded]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const taken = new Set([baseTicker.toUpperCase(), ...selected.map((s) => s.ticker.toUpperCase())]);
    return universe
      .filter((c) => !taken.has(c.ticker.toUpperCase()))
      .filter((c) => !q || c.ticker.toLowerCase().includes(q) || c.name.toLowerCase().includes(q))
      .slice(0, 40);
  }, [universe, query, baseTicker, selected]);

  return (
    <div ref={ref} style={{ position: "relative", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      {/* Chips de las comparables ya elegidas */}
      {selected.map((c) => (
        <span
          key={c.ticker}
          title={c.name}
          style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "3px 5px 3px 9px", borderRadius: 6,
            fontSize: 10.5, fontWeight: 700, fontFamily: FONT_SECONDARY,
            background: `${c.color}14`, color: c.color,
            border: `1px solid ${c.color}44`,
          }}
        >
          {c.loading && <Loader2 size={9} style={{ animation: "spin 0.8s linear infinite" }} />}
          {c.ticker}
          <button
            onClick={() => onRemove(c.ticker)}
            title="Remove"
            style={{ background: "none", border: "none", cursor: "pointer", color: c.color, display: "flex", padding: 0 }}
          >
            <X size={11} />
          </button>
        </span>
      ))}

      {/* Botón para abrir el buscador */}
      <button
        onClick={() => { if (!full) { setOpen((v) => !v); setQuery(""); } }}
        disabled={full}
        title={full ? `Máximo ${MAX_COMPARABLES} comparables` : "Add a comparable company"}
        style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          padding: "3px 9px", borderRadius: 6,
          fontSize: 10.5, fontWeight: 700,
          background: open ? "rgba(32,68,220,0.10)" : "#F5F7FD",
          color: full ? TEXT.disabled : PATRIA.blue,
          border: `1px dashed ${full ? BORDER.base : "rgba(32,68,220,0.35)"}`,
          cursor: full ? "not-allowed" : "pointer",
          whiteSpace: "nowrap",
        }}
      >
        <Plus size={11} /> Compare
      </button>

      {/* Panel de búsqueda */}
      {open && !full && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 40,
          width: 290, background: "#FFFFFF", borderRadius: 10,
          border: `1px solid ${BORDER.base}`, boxShadow: "0 12px 34px rgba(13,13,56,0.16)",
          overflow: "hidden",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", borderBottom: `1px solid ${BORDER.subtle}`, background: "#F5F7FD" }}>
            <Search size={12} style={{ color: TEXT.muted, flexShrink: 0 }} />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ticker or company…"
              style={{
                flex: 1, background: "transparent", border: "none", outline: "none",
                fontSize: 12, color: PATRIA.darkBlue, fontFamily: FONT_SECONDARY,
              }}
            />
          </div>

          <div style={{ maxHeight: 240, overflowY: "auto" }}>
            {!loaded ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "22px 0" }}>
                <Loader2 size={13} style={{ animation: "spin 0.8s linear infinite", color: PATRIA.kingBlue }} />
                <span style={{ fontSize: 11.5, color: TEXT.muted }}>Loading universe…</span>
              </div>
            ) : results.length === 0 ? (
              <p style={{ fontSize: 11.5, color: TEXT.muted, textAlign: "center", padding: "22px 12px", margin: 0, fontStyle: "italic" }}>
                {query ? `No match for "${query}"` : "No companies available"}
              </p>
            ) : (
              results.map((c) => (
                <button
                  key={c.ticker}
                  onClick={() => { onAdd(c); setOpen(false); setQuery(""); }}
                  style={{
                    display: "flex", alignItems: "baseline", gap: 8, width: "100%",
                    padding: "7px 11px", background: "transparent", border: "none",
                    borderBottom: `1px solid ${BORDER.subtle}`, cursor: "pointer", textAlign: "left",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(32,68,220,0.05)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <span style={{ fontSize: 11, fontWeight: 800, color: PATRIA.blue, fontFamily: FONT_SECONDARY, flexShrink: 0, minWidth: 62 }}>
                    {c.ticker}
                  </span>
                  <span style={{ fontSize: 11.5, color: TEXT.body, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.name}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
