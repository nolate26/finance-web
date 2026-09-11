"use client";

import { useState, useMemo } from "react";
import { Search } from "lucide-react";
import type { CompanyListItem } from "@/app/api/companies/list/route";
import { FONT_SECONDARY } from "@/lib/patriaTheme";

interface Props {
  companies: CompanyListItem[];
  /**
   * Resto de `empresas_industrias_v2`: empresas sin datos de deep dive. NO se
   * listan por defecto — sólo aparecen cuando hay algo escrito en el buscador,
   * para que por la lupa se pueda llegar a cualquier empresa de la maestra.
   */
  universe?: CompanyListItem[];
  selectedTicker: string | null;
  onSelect: (item: CompanyListItem) => void;
  loading?: boolean;
}

const matches = (c: CompanyListItem, q: string) =>
  (c.ticker?.toLowerCase() ?? "").includes(q) ||
  (c.nombre?.toLowerCase() ?? "").includes(q);

export default function CompanySidebar({ companies, universe = [], selectedTicker, onSelect, loading }: Props) {
  const [query, setQuery] = useState("");

  // Sin búsqueda: sólo la cobertura (índices + bmk + modelos + consensus). Con
  // búsqueda: primero las cubiertas, después el resto de la maestra.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return companies;
    return [
      ...companies.filter((c) => matches(c, q)),
      ...universe.filter((c) => matches(c, q)),
    ];
  }, [companies, universe, query]);

  const extraCount = filtered.filter((c) => c.hasData === false).length;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "#F5F7FD",
        borderRight: "1px solid rgba(13,13,56,0.08)",
      }}
    >
      {/* Header */}
      <div style={{ padding: "16px 14px 10px", borderBottom: "1px solid rgba(13,13,56,0.07)" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#0D0D38", letterSpacing: "-0.01em", marginBottom: 10 }}>
          Company Profiles
        </div>
        {/* Search */}
        <div style={{ position: "relative" }}>
          <Search
            size={12}
            style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "rgba(13,13,56,0.45)" }}
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search..."
            style={{
              width: "100%",
              padding: "6px 10px 6px 26px",
              borderRadius: 6,
              background: "#fff",
              border: "1px solid rgba(13,13,56,0.10)",
              color: "#0D0D38",
              fontSize: 12,
              outline: "none",
              fontFamily: FONT_SECONDARY,
              boxSizing: "border-box",
            }}
            onFocus={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = "rgba(32,68,220,0.35)";
            }}
            onBlur={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = "rgba(13,13,56,0.10)";
            }}
          />
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {loading ? (
          <div style={{ padding: "20px 14px", color: "rgba(13,13,56,0.45)", fontSize: 11, textAlign: "center" }}>
            Loading...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "20px 14px", color: "rgba(13,13,56,0.28)", fontSize: 11, textAlign: "center" }}>
            No companies found
          </div>
        ) : (
          filtered.map((c) => {
            const active = c.ticker === selectedTicker;
            // Empresa que sólo existe en la maestra: se puede abrir, pero el deep
            // dive va a venir vacío — se avisa acá y no después del click.
            const noData = c.hasData === false;
            return (
              <button
                key={c.ticker}
                onClick={() => onSelect(c)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  width: "100%",
                  padding: "9px 14px",
                  borderBottom: "1px solid rgba(13,13,56,0.04)",
                  background: active ? "rgba(32,68,220,0.08)" : "transparent",
                  border: "none",
                  borderLeft: active ? "3px solid #2044DC" : "3px solid transparent",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => {
                  if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(32,68,220,0.04)";
                }}
                onMouseLeave={(e) => {
                  if (!active) (e.currentTarget as HTMLElement).style.background = "transparent";
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums",
                    color: active ? "#2044DC" : noData ? "rgba(13,13,56,0.62)" : "#0D0D38",
                    letterSpacing: "0.02em",
                  }}
                >
                  {c.nombre}
                </span>
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 10,
                    color: "rgba(13,13,56,0.45)",
                    marginTop: 1,
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    maxWidth: "100%",
                  }}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{c.ticker}</span>
                  {noData && (
                    <span
                      style={{
                        flexShrink: 0,
                        fontSize: 8,
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        color: "#FF6B06",
                        background: "rgba(255,107,6,0.10)",
                        border: "1px solid rgba(255,107,6,0.25)",
                        borderRadius: 4,
                        padding: "0 4px",
                        lineHeight: "13px",
                      }}
                    >
                      No data
                    </span>
                  )}
                </span>
              </button>
            );
          })
        )}
      </div>

      {/* Footer count */}
      <div
        style={{
          padding: "8px 14px",
          borderTop: "1px solid rgba(13,13,56,0.07)",
          fontSize: 10,
          color: "rgba(13,13,56,0.45)",
          fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums",
        }}
      >
        {/* El denominador es siempre la cobertura; los hits extra de la maestra
            se cuentan aparte para no inflar el ratio. */}
        {filtered.length - extraCount} / {companies.length} companies
        {extraCount > 0 && (
          <span style={{ color: "#FF6B06" }}> · +{extraCount} no data</span>
        )}
      </div>
    </div>
  );
}
