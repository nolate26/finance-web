"use client";

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

// ── Formatters ────────────────────────────────────────────────────────────────

function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function fmtPct(v: unknown): { text: string; color: string } {
  const n = toNum(v);
  if (n == null) return { text: "—", color: "#CBD5E1" };
  const color = n > 0.001 ? "#059669" : n < -0.001 ? "#DC2626" : "#64748B";
  return { text: (n >= 0 ? "+" : "") + (n * 100).toFixed(1) + "%", color };
}

function fmtYield(v: unknown): string {
  const n = toNum(v);
  if (n == null) return "—";
  return (n * 100).toFixed(1) + "%";
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

function fmtInt(v: unknown): string {
  const n = toNum(v);
  if (n == null) return "—";
  return Math.round(n).toLocaleString("en-US");
}

function recBadge(rec: unknown) {
  const r = typeof rec === "string" ? rec : null;
  if (!r) return null;
  if (r === "Comprar")  return { label: "Buy",  color: "#059669", bg: "rgba(5,150,105,0.08)",  border: "rgba(5,150,105,0.20)"  };
  if (r === "Mantener") return { label: "Hold", color: "#D97706", bg: "rgba(217,119,6,0.08)",  border: "rgba(217,119,6,0.20)"  };
  if (r === "Vender")   return { label: "Sell", color: "#DC2626", bg: "rgba(220,38,38,0.08)",  border: "rgba(220,38,38,0.20)"  };
  return { label: r, color: "#475569", bg: "transparent", border: "transparent" };
}

// ── Column definitions (drives thead + sort) ──────────────────────────────────

const COLUMNS: { key: string; label: string }[] = [
  { key: "company",         label: "Company"       },
  { key: "sector",          label: "Sector"        },
  { key: "price",           label: "Price"         },
  { key: "ret_ytd",         label: "YTD Ret"       },
  { key: "mkt_cap_bn",      label: "Mkt Cap"       },
  { key: "FV",              label: "FV"            },
  { key: "Fv_ebitda_2026e", label: "FV/EBITDA 26E" },
  { key: "Fv_ebitda_2027e", label: "FV/EBITDA 27E" },
  { key: "pe_2026e",        label: "P/E 26E"       },
  { key: "pe_2027e",        label: "P/E 27E"       },
  { key: "p_bv_ltm",        label: "P/BV LTM"      },
  { key: "div_yield_2026e", label: "Div Yield 26E" },
  { key: "recommendation",  label: "Rec"           },
  { key: "target_price",    label: "Target"        },
];

const CENTER_FROM = 2; // Company + Sector are left-aligned; rest centered

export default function CompanyTable({
  companies,
  onSelect,
  sortBy,
  setSortBy,
  sortOrder,
  setSortOrder,
}: Props) {
  function handleSort(key: string) {
    if (sortBy === key) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(key);
      setSortOrder("desc");
    }
  }

  function SortIcon({ col }: { col: string }) {
    if (sortBy !== col) return <span style={{ color: "#CBD5E1", fontSize: 10, marginLeft: 3 }}>↕</span>;
    return sortOrder === "asc"
      ? <ChevronUp   size={12} style={{ color: "#2B5CE0", marginLeft: 3, display: "inline" }} />
      : <ChevronDown size={12} style={{ color: "#2B5CE0", marginLeft: 3, display: "inline" }} />;
  }

  const mono: React.CSSProperties = { fontFamily: "JetBrains Mono, monospace" };
  function cell(center = true): React.CSSProperties {
    return { padding: "9px 10px", textAlign: center ? "center" : "left", ...mono, fontSize: 12 };
  }
  const dash = <span style={{ color: "#CBD5E1" }}>—</span>;

  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <div className="overflow-x-auto w-full">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead className="sticky top-0 z-10">
            <tr style={{ background: "#F0F4FA" }}>
              {COLUMNS.map((col, ci) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  style={{
                    padding: "10px 10px",
                    textAlign: ci >= CENTER_FROM ? "center" : "left",
                    fontSize: 11,
                    fontWeight: 600,
                    color: sortBy === col.key ? "#2B5CE0" : "#64748B",
                    borderBottom: "1px solid rgba(15,23,42,0.07)",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    userSelect: "none",
                    background: "#F0F4FA",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#334155"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = sortBy === col.key ? "#2B5CE0" : "#64748B"; }}
                >
                  {col.label}<SortIcon col={col.key} />
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {companies.map((c, i) => {
              const sectorEn = SECTOR_MAP[c.sector as string] ?? (c.sector as string) ?? "—";
              const badge    = recBadge(c.recommendation);
              const ytd      = fmtPct(c.ret_ytd);

              return (
                <tr
                  key={i}
                  onClick={() => onSelect(c)}
                  style={{ borderBottom: "1px solid rgba(15,23,42,0.05)", cursor: "pointer", transition: "background 0.1s" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(43,92,224,0.04)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  {/* Company */}
                  <td style={{ padding: "9px 10px", fontWeight: 600, color: "#0F172A", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.company as string}
                  </td>

                  {/* Sector */}
                  <td style={{ padding: "9px 10px" }}>
                    <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "rgba(43,92,224,0.06)", color: "#2B5CE0", border: "1px solid rgba(43,92,224,0.12)", whiteSpace: "nowrap" }}>
                      {sectorEn}
                    </span>
                  </td>

                  {/* Price */}
                  <td style={{ ...cell(), color: "#334155" }}>
                    {fmtPrice(c.price) === "—" ? dash : fmtPrice(c.price)}
                  </td>

                  {/* YTD Ret */}
                  <td style={{ ...cell(), fontWeight: 600, color: ytd.color }}>
                    {ytd.text}
                  </td>

                  {/* Mkt Cap */}
                  <td style={{ ...cell(), color: "#475569" }}>
                    {fmtInt(c.mkt_cap_bn) === "—" ? dash : fmtInt(c.mkt_cap_bn)}
                  </td>

                  {/* FV */}
                  <td style={{ ...cell(), color: "#475569" }}>
                    {fmtInt(c.FV) === "—" ? dash : fmtInt(c.FV)}
                  </td>

                  {/* FV/EBITDA 26E */}
                  <td style={{ ...cell(), color: "#2B5CE0" }}>
                    {fmtX(c.Fv_ebitda_2026e) === "—" ? dash : fmtX(c.Fv_ebitda_2026e)}
                  </td>

                  {/* FV/EBITDA 27E */}
                  <td style={{ ...cell(), color: "#2B5CE0" }}>
                    {fmtX(c.Fv_ebitda_2027e) === "—" ? dash : fmtX(c.Fv_ebitda_2027e)}
                  </td>

                  {/* P/E 26E */}
                  <td style={{ ...cell(), color: "#7C3AED" }}>
                    {fmtX(c.pe_2026e) === "—" ? dash : fmtX(c.pe_2026e)}
                  </td>

                  {/* P/E 27E */}
                  <td style={{ ...cell(), color: "#7C3AED" }}>
                    {fmtX(c.pe_2027e) === "—" ? dash : fmtX(c.pe_2027e)}
                  </td>

                  {/* P/BV LTM */}
                  <td style={{ ...cell(), color: "#475569" }}>
                    {fmtX(c.p_bv_ltm) === "—" ? dash : fmtX(c.p_bv_ltm)}
                  </td>

                  {/* Div Yield 26E */}
                  <td style={{ ...cell(), color: "#D97706", fontWeight: 600 }}>
                    {fmtYield(c.div_yield_2026e) === "—" ? dash : fmtYield(c.div_yield_2026e)}
                  </td>

                  {/* Rec */}
                  <td style={{ ...cell() }}>
                    {badge ? (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 10, background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`, fontFamily: "monospace" }}>
                        {badge.label}
                      </span>
                    ) : dash}
                  </td>

                  {/* Target */}
                  <td style={{ ...cell(), color: "#64748B" }}>
                    {fmtPrice(c.target_price) === "—" ? dash : fmtPrice(c.target_price)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Row count footer */}
      <div style={{ display: "flex", alignItems: "center", padding: "8px 16px", borderTop: "1px solid rgba(15,23,42,0.07)", background: "#F8FAFF" }}>
        <span style={{ fontSize: 11, color: "#64748B", fontFamily: "JetBrains Mono, monospace" }}>
          {companies.length} compan{companies.length !== 1 ? "ies" : "y"}
        </span>
      </div>
    </div>
  );
}
