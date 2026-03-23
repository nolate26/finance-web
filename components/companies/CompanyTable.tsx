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
  if (!rec) return { label: "—", color: "#64748B", bg: "transparent", border: "transparent" };
  if (rec === "Comprar") return { label: "Buy", color: "#059669", bg: "rgba(5,150,105,0.08)", border: "rgba(5,150,105,0.20)" };
  if (rec === "Mantener") return { label: "Hold", color: "#D97706", bg: "rgba(217,119,6,0.08)", border: "rgba(217,119,6,0.20)" };
  if (rec === "Vender") return { label: "Sell", color: "#DC2626", bg: "rgba(220,38,38,0.08)", border: "rgba(220,38,38,0.20)" };
  return { label: rec, color: "#475569", bg: "transparent", border: "transparent" };
}

const columns: { key: string; label: string; align?: "right" }[] = [
  { key: "company", label: "Company" },
  { key: "sector", label: "Sector" },
  { key: "price", label: "Price", align: "right" },
  { key: "mkt_cap_bn", label: "Mkt Cap (MM CLP)", align: "right" },
  { key: "ret_1y", label: "1Y Ret", align: "right" },
  { key: "Fv_ebitda_ltm", label: "FV/EBITDA LTM", align: "right" },
  { key: "pe_ltm", label: "P/E LTM", align: "right" },
  { key: "roe_ltm", label: "ROE LTM", align: "right" },
  { key: "recommendation", label: "Rec", align: "right" },
  { key: "target_price", label: "Target", align: "right" },
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
      return <span style={{ color: "#CBD5E1", fontSize: 10, marginLeft: 4 }}>↕</span>;
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
            <tr style={{ background: "#F0F4FA" }}>
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  style={{
                    padding: "10px 14px",
                    textAlign: col.align === "right" ? "right" : "left",
                    fontSize: 11,
                    fontWeight: 600,
                    color: sortBy === col.key ? "#2B5CE0" : "#64748B",
                    borderBottom: "1px solid rgba(15,23,42,0.07)",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    userSelect: "none",
                    background: "#F0F4FA",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.color = "#334155";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.color =
                      sortBy === col.key ? "#2B5CE0" : "#64748B";
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
              const rec = recBadge(c.recommendation as string | null);
              const ret1y = c.ret_1y as number | null;
              const sectorEn = SECTOR_MAP[c.sector as string] ?? (c.sector as string) ?? "—";
              return (
                <tr
                  key={i}
                  onClick={() => onSelect(c)}
                  style={{
                    borderBottom: "1px solid rgba(15,23,42,0.05)",
                    cursor: "pointer",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "rgba(43,92,224,0.04)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                  }}
                >
                  {/* Company */}
                  <td
                    style={{
                      padding: "9px 14px",
                      color: "#0F172A",
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
                        background: "rgba(43,92,224,0.06)",
                        color: "#2B5CE0",
                        border: "1px solid rgba(43,92,224,0.12)",
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
                      color: "#334155",
                    }}
                  >
                    {fmtPrice(c.price as number | null)}
                  </td>

                  {/* Mkt Cap */}
                  <td
                    style={{
                      padding: "9px 14px",
                      textAlign: "right",
                      fontFamily: "JetBrains Mono, monospace",
                      color: "#475569",
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
                          ? "#64748B"
                          : ret1y >= 0
                          ? "#059669"
                          : "#DC2626",
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
                      color: "#475569",
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
                      color: "#475569",
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
                      color: "#475569",
                    }}
                  >
                    {fmtPct(c.roe_ltm as number | null)}
                  </td>

                  {/* Rec */}
                  <td style={{ padding: "9px 14px", textAlign: "right" }}>
                    {c.recommendation ? (
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
                      <span style={{ color: "#CBD5E1" }}>—</span>
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
                    {fmtPrice(c.target_price as number | null)}
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
          borderTop: "1px solid rgba(15,23,42,0.07)",
          background: "#F8FAFF",
        }}
      >
        <span
          style={{ fontSize: 11, color: "#64748B", fontFamily: "JetBrains Mono, monospace" }}
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
              border: "1px solid rgba(43,92,224,0.15)",
              background: page === 0 ? "transparent" : "rgba(43,92,224,0.06)",
              color: page === 0 ? "#CBD5E1" : "#475569",
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
              border: "1px solid rgba(43,92,224,0.15)",
              background: page >= totalPages - 1 ? "transparent" : "rgba(43,92,224,0.06)",
              color: page >= totalPages - 1 ? "#CBD5E1" : "#475569",
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
