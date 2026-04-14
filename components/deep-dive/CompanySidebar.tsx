"use client";

import { useState, useMemo } from "react";
import { Search } from "lucide-react";
import type { CompanyListItem } from "@/app/api/companies/list/route";

interface Props {
  companies: CompanyListItem[];
  selectedTicker: string | null;
  onSelect: (item: CompanyListItem) => void;
  loading?: boolean;
}

export default function CompanySidebar({ companies, selectedTicker, onSelect, loading }: Props) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    if (!q) return companies;
    return companies.filter(
      (c) =>
        (c.ticker?.toLowerCase() ?? "").includes(q) ||
        (c.nombre?.toLowerCase() ?? "").includes(q)
    );
  }, [companies, query]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "#F8FAFF",
        borderRight: "1px solid rgba(15,23,42,0.08)",
      }}
    >
      {/* Header */}
      <div style={{ padding: "16px 14px 10px", borderBottom: "1px solid rgba(15,23,42,0.07)" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#0F172A", letterSpacing: "-0.01em", marginBottom: 10 }}>
          Company Profiles
        </div>
        {/* Search */}
        <div style={{ position: "relative" }}>
          <Search
            size={12}
            style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "#94A3B8" }}
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
              border: "1px solid rgba(15,23,42,0.10)",
              color: "#0F172A",
              fontSize: 12,
              outline: "none",
              fontFamily: "Inter, sans-serif",
              boxSizing: "border-box",
            }}
            onFocus={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = "rgba(43,92,224,0.35)";
            }}
            onBlur={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = "rgba(15,23,42,0.10)";
            }}
          />
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {loading ? (
          <div style={{ padding: "20px 14px", color: "#94A3B8", fontSize: 11, textAlign: "center" }}>
            Loading...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "20px 14px", color: "#CBD5E1", fontSize: 11, textAlign: "center" }}>
            No companies found
          </div>
        ) : (
          filtered.map((c) => {
            const active = c.ticker === selectedTicker;
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
                  borderBottom: "1px solid rgba(15,23,42,0.04)",
                  background: active ? "rgba(43,92,224,0.08)" : "transparent",
                  border: "none",
                  borderLeft: active ? "3px solid #2B5CE0" : "3px solid transparent",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => {
                  if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(43,92,224,0.04)";
                }}
                onMouseLeave={(e) => {
                  if (!active) (e.currentTarget as HTMLElement).style.background = "transparent";
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    fontFamily: "JetBrains Mono, monospace",
                    color: active ? "#2B5CE0" : "#0F172A",
                    letterSpacing: "0.02em",
                  }}
                >
                  {c.ticker}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    color: "#94A3B8",
                    marginTop: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: "100%",
                  }}
                >
                  {c.nombre}
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
          borderTop: "1px solid rgba(15,23,42,0.07)",
          fontSize: 10,
          color: "#94A3B8",
          fontFamily: "JetBrains Mono, monospace",
        }}
      >
        {filtered.length} / {companies.length} companies
      </div>
    </div>
  );
}
