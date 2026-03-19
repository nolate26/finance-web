"use client";

import { useState } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { Company, SECTOR_MAP } from "@/lib/companies";

interface Props {
  companies: Company[];
  onSelect: (c: Company) => void;
  sortBy: string;
  setSortBy: (s: string) => void;
  sortOrder: "asc" | "desc";
  setSortOrder: (o: "asc" | "desc") => void;
}

const PAGE_SIZE = 20;

function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function fmtPct(v: unknown): string {
  const n = toNum(v);
  if (n == null) return "—";
  return (n >= 0 ? "+" : "") + (n * 100).toFixed(1) + "%";
}

function fmtX(v: unknown): string {
  const n = toNum(v);
  if (n == null) return "—";
  return n.toFixed(1) + "x";
}

function fmtPrice(v: unknown): string {
  const n = toNum(v);
  if (n == null) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function fmtMM(v: unknown): string {
  const n = toNum(v);
  if (n == null) return "—";
  return Math.round(n).toLocaleString("en-US");
}

function recBadge(rec: string | null) {
  if (!rec) return { label: "—", color: "#475569", bg: "transparent", border: "transparent" };
  if (rec === "Comprar") return { label: "Buy", color: "#10B981", bg: "rgba(16,185,129,0.1)", border: "rgba(16,185,129,0.25)" };
  if (rec === "Mantener") return { label: "Hold", color: "#F59E0B", bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.25)" };
  if (rec === "Vender") return { label: "Sell", color: "#EF4444", bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.25)" };
  return { label: rec, color: "#B0C4E8", bg: "transparent", border: "transparent" };
}

const columns: { key: string; label: string; align?: "right" }[] = [
  { key: "company", label: "Company" },
  { key: "sector", label: "Sector" },
  { key: "precio_actual", label: "Price", align: "right" },
  { key: "mkt_cap_bn", label: "Mkt Cap (MM CLP)", align: "right" },
  { key: "ret_1y", label: "1Y Ret", align: "right" },
  { key: "Fv_ebitda_ltm", label: "FV/EBITDA LTM", align: "right" },
  { key: "pe_ltm", label: "P/E LTM", align: "right" },
  { key: "roe_ltm", label: "ROE LTM", align: "right" },
  { key: "recomendacion", label: "Rec", align: "right" },
  { key: "precio_objetivo", label: "Target", align: "right" },
];

export default function CompanyTable({
  companies,
  onSelect,
  sortBy,
  setSortBy,
  sortOrder,
  setSortOrder,
}: Props) {
  const [page, setPage] = useState(0);

  const totalPages = Math.ceil(companies.length / PAGE_SIZE);
  const startIdx = page * PAGE_SIZE;
  const endIdx = Math.min(startIdx + PAGE_SIZE, companies.length);
  const pageRows = companies.slice(startIdx, endIdx);

  function handleSort(key: string) {
    if (sortBy === key) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(key);
      setSortOrder("desc");
    }
    setPage(0);
  }

  function SortIcon({ col }: { col: string }) {
    if (sortBy !== col) {
      return <span style={{ color: "#2D3E6E", fontSize: 10, marginLeft: 4 }}>↕</span>;
    }
    return sortOrder === "asc" ? (
      <ChevronUp size={12} style={{ color: "#2B5CE0", marginLeft: 4, display: "inline" }} />
    ) : (
      <ChevronDown size={12} style={{ color: "#2B5CE0", marginLeft: 4, display: "inline" }} />
    );
  }

  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <div style={{ overflowX: "auto", maxHeight: "calc(100vh - 380px)", overflowY: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead style={{ position: "sticky", top: 0, zIndex: 5 }}>
            <tr style={{ background: "#09103A" }}>
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  style={{
                    padding: "10px 14px",
                    textAlign: col.align === "right" ? "right" : "left",
                    fontSize: 11,
                    fontWeight: 600,
                    color: sortBy === col.key ? "#6699FF" : "#8B9EC8",
                    borderBottom: "1px solid rgba(43,92,224,0.12)",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    userSelect: "none",
                    background: "#09103A",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.color = "#94A3B8";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.color =
                      sortBy === col.key ? "#6699FF" : "#8B9EC8";
                  }}
                >
                  {col.label}
                  <SortIcon col={col.key} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((c, i) => {
              const rec = recBadge(c.recomendacion as string | null);
              const ret1y = c.ret_1y as number | null;
              const sectorEn = SECTOR_MAP[c.sector as string] ?? (c.sector as string) ?? "—";
              return (
                <tr
                  key={i}
                  onClick={() => onSelect(c)}
                  style={{
                    borderBottom: "1px solid rgba(43,92,224,0.07)",
                    cursor: "pointer",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "rgba(43,92,224,0.05)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                  }}
                >
                  {/* Company */}
                  <td
                    style={{
                      padding: "9px 14px",
                      color: "#EEF2FF",
                      fontWeight: 600,
                      maxWidth: 180,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {c.company as string}
                  </td>

                  {/* Sector */}
                  <td style={{ padding: "9px 14px" }}>
                    <span
                      style={{
                        fontSize: 10,
                        padding: "2px 6px",
                        borderRadius: 4,
                        background: "rgba(80,128,255,0.08)",
                        color: "#5080FF",
                        border: "1px solid rgba(80,128,255,0.15)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {sectorEn}
                    </span>
                  </td>

                  {/* Price */}
                  <td
                    style={{
                      padding: "9px 14px",
                      textAlign: "right",
                      fontFamily: "JetBrains Mono, monospace",
                      color: "#C5D4FF",
                    }}
                  >
                    {fmtPrice(c.precio_actual as number | null)}
                  </td>

                  {/* Mkt Cap */}
                  <td
                    style={{
                      padding: "9px 14px",
                      textAlign: "right",
                      fontFamily: "JetBrains Mono, monospace",
                      color: "#B0C4E8",
                    }}
                  >
                    {fmtMM(c.mkt_cap_bn as number | null)}
                  </td>

                  {/* 1Y Return */}
                  <td
                    style={{
                      padding: "9px 14px",
                      textAlign: "right",
                      fontFamily: "JetBrains Mono, monospace",
                      fontWeight: 600,
                      color:
                        ret1y === null
                          ? "#475569"
                          : ret1y >= 0
                          ? "#10B981"
                          : "#EF4444",
                    }}
                  >
                    {fmtPct(ret1y)}
                  </td>

                  {/* FV/EBITDA LTM */}
                  <td
                    style={{
                      padding: "9px 14px",
                      textAlign: "right",
                      fontFamily: "JetBrains Mono, monospace",
                      color: "#B0C4E8",
                    }}
                  >
                    {fmtX(c.Fv_ebitda_ltm as number | null)}
                  </td>

                  {/* P/E LTM */}
                  <td
                    style={{
                      padding: "9px 14px",
                      textAlign: "right",
                      fontFamily: "JetBrains Mono, monospace",
                      color: "#B0C4E8",
                    }}
                  >
                    {fmtX(c.pe_ltm as number | null)}
                  </td>

                  {/* ROE LTM */}
                  <td
                    style={{
                      padding: "9px 14px",
                      textAlign: "right",
                      fontFamily: "JetBrains Mono, monospace",
                      color: "#B0C4E8",
                    }}
                  >
                    {fmtPct(c.roe_ltm as number | null)}
                  </td>

                  {/* Rec */}
                  <td style={{ padding: "9px 14px", textAlign: "right" }}>
                    {c.recomendacion ? (
                      <span
                        className="font-mono"
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: "2px 7px",
                          borderRadius: 10,
                          background: rec.bg,
                          color: rec.color,
                          border: `1px solid ${rec.border}`,
                        }}
                      >
                        {rec.label}
                      </span>
                    ) : (
                      <span style={{ color: "#2D3E6E" }}>—</span>
                    )}
                  </td>

                  {/* Target */}
                  <td
                    style={{
                      padding: "9px 14px",
                      textAlign: "right",
                      fontFamily: "JetBrains Mono, monospace",
                      color: "#64748B",
                    }}
                  >
                    {fmtPrice(c.precio_objetivo as number | null)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 16px",
          borderTop: "1px solid rgba(43,92,224,0.1)",
          background: "rgba(9,16,58,0.6)",
        }}
      >
        <span
          style={{ fontSize: 11, color: "#475569", fontFamily: "JetBrains Mono, monospace" }}
        >
          Showing {companies.length === 0 ? 0 : startIdx + 1}–{endIdx} of {companies.length}
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            style={{
              padding: "4px 12px",
              borderRadius: 6,
              fontSize: 12,
              border: "1px solid rgba(43,92,224,0.2)",
              background: page === 0 ? "transparent" : "rgba(43,92,224,0.08)",
              color: page === 0 ? "#2D3E6E" : "#94A3B8",
              cursor: page === 0 ? "not-allowed" : "pointer",
            }}
          >
            Previous
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            style={{
              padding: "4px 12px",
              borderRadius: 6,
              fontSize: 12,
              border: "1px solid rgba(43,92,224,0.2)",
              background: page >= totalPages - 1 ? "transparent" : "rgba(43,92,224,0.08)",
              color: page >= totalPages - 1 ? "#2D3E6E" : "#94A3B8",
              cursor: page >= totalPages - 1 ? "not-allowed" : "pointer",
            }}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
