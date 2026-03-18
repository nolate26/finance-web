"use client";

import { X } from "lucide-react";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Company, SECTOR_MAP } from "@/lib/companies";

interface Props {
  company: Company | null;
  onClose: () => void;
}

function fmtPct(v: number | null): string {
  if (v == null) return "—";
  return (v >= 0 ? "+" : "") + (v * 100).toFixed(1) + "%";
}

function fmtX(v: number | null): string {
  if (v == null) return "—";
  return v.toFixed(1) + "x";
}

function fmtPrice(v: number | null): string {
  if (v == null) return "—";
  return v.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function fmtMM(v: number | null): string {
  if (v == null) return "—";
  return Math.round(v).toLocaleString("en-US");
}

function recBadge(rec: string | null) {
  if (!rec) return { label: "—", color: "#94A3B8", bg: "rgba(148,163,184,0.1)", border: "rgba(148,163,184,0.2)" };
  if (rec === "Comprar") return { label: "Buy", color: "#10B981", bg: "rgba(16,185,129,0.12)", border: "rgba(16,185,129,0.3)" };
  if (rec === "Mantener") return { label: "Hold", color: "#F59E0B", bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.3)" };
  if (rec === "Vender") return { label: "Sell", color: "#EF4444", bg: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.3)" };
  return { label: rec, color: "#94A3B8", bg: "rgba(148,163,184,0.1)", border: "rgba(148,163,184,0.2)" };
}

const SECTION_LABEL: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: "0.1em",
  color: "#3B82F6",
  textTransform: "uppercase",
  marginBottom: 10,
};

const DIVIDER: React.CSSProperties = {
  borderTop: "1px solid rgba(59,130,246,0.1)",
  margin: "16px 0",
};

interface TooltipPayload {
  value: number;
}

function ReturnTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayload[]; label?: string }) {
  if (!active || !payload || !payload.length) return null;
  const val = payload[0].value;
  const color = val >= 0 ? "#10B981" : "#EF4444";
  return (
    <div style={{
      background: "#0A1628",
      border: "1px solid rgba(59,130,246,0.2)",
      borderRadius: 6,
      padding: "6px 10px",
      fontSize: 11,
      fontFamily: "JetBrains Mono, monospace",
    }}>
      <div style={{ color: "#94A3B8", marginBottom: 2 }}>{label}</div>
      <div style={{ color, fontWeight: 600 }}>{val >= 0 ? "+" : ""}{(val * 100).toFixed(1)}%</div>
    </div>
  );
}

function n(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const num = Number(v);
  return isNaN(num) ? null : num;
}

export default function CompanyModal({ company, onClose }: Props) {
  if (!company) return null;

  const rec = recBadge(company.recomendacion as string | null);
  const sectorEn = SECTOR_MAP[company.sector as string] ?? (company.sector as string) ?? "—";

  const precioActual = n(company.precio_actual);
  const precioObjetivo = n(company.precio_objetivo);

  const upside =
    precioActual !== null && precioObjetivo !== null
      ? (precioObjetivo - precioActual) / precioActual
      : null;

  const returnBars = [
    { name: "1M", value: n(company.ret_1m) },
    { name: "YTD", value: n(company.ret_ytd) },
    { name: "1Y", value: n(company.ret_1y) },
    { name: "5Y", value: n(company.ret_5y) },
  ].filter((d): d is { name: string; value: number } => d.value !== null);

  const valuationRows: { label: string; cols: (number | null)[] }[] = [
    {
      label: "FV/EBITDA",
      cols: [
        n(company.Fv_ebitda_2024),
        n(company.Fv_ebitda_ltm),
        n(company.Fv_ebitda_2025e),
        n(company.Fv_ebitda_2026e),
        n(company.Fv_ebitda_2027e),
      ],
    },
    {
      label: "P/E",
      cols: [
        n(company.pe_2024),
        n(company.pe_ltm),
        n(company.pe_2025e),
        n(company.pe_2026e),
        n(company.pe_2027e),
      ],
    },
    {
      label: "P/BV",
      cols: [null, n(company.p_bv_ltm), null, null, null],
    },
    {
      label: "ROE",
      cols: [null, n(company.roe_ltm), null, n(company.roe_2026e), null],
    },
  ];

  const colHeaders = ["2024A", "LTM", "2025E", "2026E", "2027E"];

  const estimateRows: { label: string; cols: (number | null)[] }[] = [
    {
      label: "EBITDA",
      cols: [
        n(company.ebitda_prev),
        n(company.ebitda_ltm),
        n(company.ebitda_2025e),
        n(company.ebitda_2026e),
        n(company.ebitda_2027e),
      ],
    },
    {
      label: "Net Income",
      cols: [
        n(company.net_income_prev),
        n(company.net_income_ltm),
        n(company.ni_2025e),
        n(company.ni_2026e),
        n(company.ni_2027e),
      ],
    },
  ];

  const roicLtm = n(company.roic_ltm);
  const qualityChips = [
    {
      label: "ROIC LTM",
      value: roicLtm !== null ? fmtPct(roicLtm) : "—",
      color: roicLtm !== null && roicLtm >= 0 ? "#10B981" : "#EF4444",
    },
    {
      label: "ND/EBITDA",
      value: fmtX(n(company.leverage_ltm)),
      color: "#06B6D4",
    },
    {
      label: "Div Yield 2026E",
      value: fmtPct(n(company.div_yield_2026e)),
      color: "#F59E0B",
    },
    {
      label: "P/CE LTM",
      value: fmtX(n(company.p_ce_ltm)),
      color: "#8B5CF6",
    },
  ];

  const thStyle: React.CSSProperties = {
    padding: "6px 10px",
    textAlign: "right" as const,
    fontSize: 10,
    fontWeight: 600,
    color: "#475569",
    letterSpacing: "0.05em",
    borderBottom: "1px solid rgba(59,130,246,0.1)",
  };

  const tdStyle: React.CSSProperties = {
    padding: "6px 10px",
    textAlign: "right" as const,
    fontSize: 11,
    fontFamily: "JetBrains Mono, monospace",
    color: "#CBD5E1",
    borderBottom: "1px solid rgba(59,130,246,0.06)",
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 50,
          background: "rgba(5,11,24,0.7)",
          backdropFilter: "blur(4px)",
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: "fixed",
          right: 0,
          top: 0,
          bottom: 0,
          width: 520,
          zIndex: 51,
          background: "#0A1628",
          borderLeft: "1px solid rgba(59,130,246,0.2)",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          boxShadow: "-20px 0 60px rgba(0,0,0,0.6)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 24px 16px",
            borderBottom: "1px solid rgba(59,130,246,0.12)",
            background: "linear-gradient(180deg, #0F2040 0%, #0A1628 100%)",
            position: "sticky",
            top: 0,
            zIndex: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <h2
                className="font-mono"
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: "#fff",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  marginBottom: 8,
                }}
              >
                {company.company as string}
              </h2>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <span
                  style={{
                    fontSize: 11,
                    padding: "2px 8px",
                    borderRadius: 4,
                    background: "rgba(6,182,212,0.1)",
                    color: "#06B6D4",
                    border: "1px solid rgba(6,182,212,0.2)",
                    fontWeight: 500,
                  }}
                >
                  {sectorEn}
                </span>
                {(company.recomendacion as string | null) && (
                  <span
                    className="font-mono"
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: 4,
                      background: rec.bg,
                      color: rec.color,
                      border: `1px solid ${rec.border}`,
                    }}
                  >
                    {rec.label}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(59,130,246,0.15)",
                borderRadius: 6,
                padding: "6px 8px",
                cursor: "pointer",
                color: "#64748B",
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "rgba(59,130,246,0.1)";
                (e.currentTarget as HTMLElement).style.color = "#fff";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)";
                (e.currentTarget as HTMLElement).style.color = "#64748B";
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: "20px 24px", flex: 1 }}>
          {/* Price & Returns */}
          <div style={SECTION_LABEL as React.CSSProperties}>Price & Returns</div>

          <div style={{ display: "flex", gap: 20, alignItems: "flex-end", marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 10, color: "#475569", marginBottom: 2 }}>Current Price</div>
              <div className="font-mono" style={{ fontSize: 26, fontWeight: 700, color: "#E2E8F0" }}>
                {fmtPrice(precioActual)}
              </div>
            </div>
            {precioObjetivo !== null && (
              <div>
                <div style={{ fontSize: 10, color: "#475569", marginBottom: 2 }}>Target Price</div>
                <div className="font-mono" style={{ fontSize: 18, fontWeight: 600, color: "#94A3B8" }}>
                  {fmtPrice(precioObjetivo)}
                </div>
              </div>
            )}
            {upside !== null && (
              <div
                className="font-mono"
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  padding: "4px 10px",
                  borderRadius: 6,
                  background: upside >= 0 ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)",
                  color: upside >= 0 ? "#10B981" : "#EF4444",
                  border: `1px solid ${upside >= 0 ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.25)"}`,
                  marginBottom: 4,
                }}
              >
                {fmtPct(upside)}
              </div>
            )}
          </div>

          {returnBars.length > 0 && (
            <div style={{ height: 120, marginBottom: 8 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={returnBars} barCategoryGap="30%">
                  <XAxis
                    dataKey="name"
                    tick={{ fill: "#475569", fontSize: 10, fontFamily: "JetBrains Mono, monospace" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis hide />
                  <Tooltip content={<ReturnTooltip />} cursor={{ fill: "rgba(59,130,246,0.05)" }} />
                  <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                    {returnBars.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.value >= 0 ? "#10B981" : "#EF4444"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div style={DIVIDER} />

          {/* Valuation Multiples */}
          <div style={SECTION_LABEL as React.CSSProperties}>Valuation Multiples</div>
          <div style={{ overflowX: "auto", marginBottom: 4 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, textAlign: "left", paddingLeft: 0 }}>Metric</th>
                  {colHeaders.map((h) => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {valuationRows.map((row) => (
                  <tr key={row.label}>
                    <td
                      style={{
                        ...tdStyle,
                        textAlign: "left",
                        paddingLeft: 0,
                        color: "#94A3B8",
                        fontWeight: 600,
                        fontFamily: "Inter, sans-serif",
                        fontSize: 11,
                      }}
                    >
                      {row.label}
                    </td>
                    {row.cols.map((val, i) => (
                      <td key={i} style={tdStyle}>
                        {row.label === "ROE"
                          ? val !== null ? fmtPct(val) : "—"
                          : val !== null ? fmtX(val) : "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={DIVIDER} />

          {/* EBITDA & Net Income Estimates */}
          <div style={SECTION_LABEL as React.CSSProperties}>EBITDA & Net Income Estimates</div>
          <div style={{ overflowX: "auto", marginBottom: 4 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, textAlign: "left", paddingLeft: 0 }}>Item</th>
                  {["Prev", "LTM", "2025E", "2026E", "2027E"].map((h) => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {estimateRows.map((row) => (
                  <tr key={row.label}>
                    <td
                      style={{
                        ...tdStyle,
                        textAlign: "left",
                        paddingLeft: 0,
                        color: "#94A3B8",
                        fontWeight: 600,
                        fontFamily: "Inter, sans-serif",
                        fontSize: 11,
                      }}
                    >
                      {row.label}
                    </td>
                    {row.cols.map((val, i) => (
                      <td key={i} style={tdStyle}>
                        {fmtMM(val)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 10, color: "#334155", marginBottom: 4 }}>Values in MM CLP</div>

          <div style={DIVIDER} />

          {/* Quality & Capital */}
          <div style={SECTION_LABEL as React.CSSProperties}>Quality & Capital</div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
            }}
          >
            {qualityChips.map(({ label, value, color }) => (
              <div
                key={label}
                style={{
                  background: "rgba(15,32,64,0.6)",
                  border: "1px solid rgba(59,130,246,0.1)",
                  borderRadius: 8,
                  padding: "12px 14px",
                }}
              >
                <div style={{ fontSize: 10, color: "#475569", marginBottom: 4 }}>{label}</div>
                <div
                  className="font-mono"
                  style={{ fontSize: 18, fontWeight: 700, color }}
                >
                  {value}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
