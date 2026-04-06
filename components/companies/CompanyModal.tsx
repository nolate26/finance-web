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
import { Company } from "@/lib/companies";

interface Props {
  company: Company | null;
  onClose: () => void;
}

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
  if (!rec) return { label: "—", color: "#64748B", bg: "rgba(100,116,139,0.08)", border: "rgba(100,116,139,0.15)" };
  if (rec === "Comprar") return { label: "Buy",  color: "#059669", bg: "rgba(5,150,105,0.10)",  border: "rgba(5,150,105,0.25)" };
  if (rec === "Mantener") return { label: "Hold", color: "#D97706", bg: "rgba(217,119,6,0.10)",  border: "rgba(217,119,6,0.25)" };
  if (rec === "Vender")  return { label: "Sell", color: "#DC2626", bg: "rgba(220,38,38,0.10)", border: "rgba(220,38,38,0.25)" };
  return { label: rec, color: "#64748B", bg: "rgba(100,116,139,0.08)", border: "rgba(100,116,139,0.15)" };
}

interface TooltipPayload { value: number; }
function ReturnTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayload[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const val = payload[0].value;
  const color = val >= 0 ? "#059669" : "#DC2626";
  return (
    <div style={{ background: "#FFFFFF", border: "1px solid rgba(15,23,42,0.10)", borderRadius: 6, padding: "6px 10px", fontSize: 11, fontFamily: "JetBrains Mono, monospace", boxShadow: "0 4px 12px rgba(15,23,42,0.10)" }}>
      <div style={{ color: "#64748B", marginBottom: 2 }}>{label}</div>
      <div style={{ color, fontWeight: 600 }}>{val >= 0 ? "+" : ""}{(val * 100).toFixed(1)}%</div>
    </div>
  );
}

function n(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const num = Number(v);
  return isNaN(num) ? null : num;
}

const SECTION_LABEL: React.CSSProperties = { fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", color: "#2B5CE0", textTransform: "uppercase", marginBottom: 10 };
const DIVIDER: React.CSSProperties = { borderTop: "1px solid rgba(15,23,42,0.08)", margin: "16px 0" };
const thStyle: React.CSSProperties = { padding: "6px 10px", textAlign: "right", fontSize: 10, fontWeight: 600, color: "#64748B", letterSpacing: "0.05em", borderBottom: "1px solid rgba(15,23,42,0.08)" };
const tdStyle: React.CSSProperties = { padding: "6px 10px", textAlign: "right", fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "#334155", borderBottom: "1px solid rgba(15,23,42,0.05)" };

export default function CompanyModal({ company, onClose }: Props) {
  if (!company) return null;

  const rec = recBadge(company.recommendation as string | null);
  const sectorEn = (company.sector as string) ?? "—";

  const price = n(company.price);
  const targetPrice = n(company.target_price);
  const upside = price !== null && targetPrice !== null ? (targetPrice - price) / price : null;

  const returnBars = [
    { name: "1M",  value: n(company.ret_1m) },
    { name: "YTD", value: n(company.ret_ytd) },
    { name: "1Y",  value: n(company.ret_1y) },
    { name: "5Y",  value: n(company.ret_5y) },
  ].filter((d): d is { name: string; value: number } => d.value !== null);

  const valuationRows = [
    { label: "FV/EBITDA", cols: [n(company.Fv_ebitda_ltm), n(company.Fv_ebitda_2026e), n(company.Fv_ebitda_2027e)] },
    { label: "P/E",       cols: [n(company.pe_ltm),        n(company.pe_2026e),        n(company.pe_2027e)] },
    { label: "P/BV",      cols: [n(company.p_bv_ltm),      null,                       null] },
    { label: "ROE",       cols: [n(company.roe_ltm),       n(company.roe_2026e),       null] },
  ];

  const estimateRows = [
    { label: "EBITDA",     cols: [n(company.ebitda_ltm), n(company.ebitda_2026e), n(company.ebitda_2027e)] },
    { label: "Net Income", cols: [n(company.net_income_ltm), n(company.ni_2026e), n(company.ni_2027e)] },
  ];

  const roicLtm = n(company.roic_ltm);
  const qualityChips = [
    { label: "ROIC LTM",       value: roicLtm !== null ? fmtPct(roicLtm) : "—", color: roicLtm !== null && roicLtm >= 0 ? "#059669" : "#DC2626" },
    { label: "ND/EBITDA",      value: fmtX(n(company.leverage_ltm)),             color: "#2B5CE0" },
    { label: "Div Yield 2026E",value: fmtPct(n(company.div_yield_2026e)),        color: "#D97706" },
    { label: "P/CE LTM",       value: fmtX(n(company.p_ce_ltm)),                 color: "#7C3AED" },
  ];

  const colHeaders = ["LTM", "2026E", "2027E"];

  return (
    // Inline panel — no overlay, no fixed positioning
    <div
      className="card mt-5"
      style={{ overflow: "hidden" }}
    >
      {/* Header */}
      <div style={{ padding: "18px 24px 14px", borderBottom: "1px solid rgba(15,23,42,0.08)", background: "#F8FAFF", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <h2 className="font-mono" style={{ fontSize: 18, fontWeight: 700, color: "#0F172A", marginBottom: 8 }}>
            {company.company as string}
          </h2>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "rgba(43,92,224,0.08)", color: "#2B5CE0", border: "1px solid rgba(43,92,224,0.15)", fontWeight: 500 }}>
              {sectorEn}
            </span>
            {(company.recommendation as string | null) && (
              <span className="font-mono" style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: rec.bg, color: rec.color, border: `1px solid ${rec.border}` }}>
                {rec.label}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{ background: "rgba(15,23,42,0.04)", border: "1px solid rgba(15,23,42,0.10)", borderRadius: 6, padding: "6px 8px", cursor: "pointer", color: "#64748B", flexShrink: 0 }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(43,92,224,0.08)"; (e.currentTarget as HTMLElement).style.color = "#2B5CE0"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(15,23,42,0.04)"; (e.currentTarget as HTMLElement).style.color = "#64748B"; }}
        >
          <X size={16} />
        </button>
      </div>

      {/* Body — two-column layout for wide panels */}
      <div style={{ padding: "20px 24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
        {/* Left column */}
        <div>
          <div style={SECTION_LABEL as React.CSSProperties}>Price &amp; Returns</div>
          <div style={{ display: "flex", gap: 20, alignItems: "flex-end", marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 10, color: "#64748B", marginBottom: 2 }}>Current Price</div>
              <div className="font-mono" style={{ fontSize: 26, fontWeight: 700, color: "#0F172A" }}>{fmtPrice(price)}</div>
            </div>
            {targetPrice !== null && (
              <div>
                <div style={{ fontSize: 10, color: "#64748B", marginBottom: 2 }}>Target Price</div>
                <div className="font-mono" style={{ fontSize: 18, fontWeight: 600, color: "#475569" }}>{fmtPrice(targetPrice)}</div>
              </div>
            )}
            {upside !== null && (
              <div className="font-mono" style={{ fontSize: 13, fontWeight: 700, padding: "4px 10px", borderRadius: 6, background: upside >= 0 ? "rgba(5,150,105,0.10)" : "rgba(220,38,38,0.10)", color: upside >= 0 ? "#059669" : "#DC2626", border: `1px solid ${upside >= 0 ? "rgba(5,150,105,0.20)" : "rgba(220,38,38,0.20)"}`, marginBottom: 4 }}>
                {fmtPct(upside)}
              </div>
            )}
          </div>
          {returnBars.length > 0 && (
            <div style={{ height: 110 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={returnBars} barCategoryGap="30%">
                  <XAxis dataKey="name" tick={{ fill: "#94A3B8", fontSize: 10, fontFamily: "JetBrains Mono, monospace" }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip content={<ReturnTooltip />} cursor={{ fill: "rgba(43,92,224,0.04)" }} />
                  <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                    {returnBars.map((entry, i) => <Cell key={`cell-${i}`} fill={entry.value >= 0 ? "#059669" : "#DC2626"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <div style={DIVIDER} />
          <div style={SECTION_LABEL as React.CSSProperties}>Quality &amp; Capital</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {qualityChips.map(({ label, value, color }) => (
              <div key={label} style={{ background: "#F8FAFF", border: "1px solid rgba(15,23,42,0.08)", borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ fontSize: 10, color: "#64748B", marginBottom: 3 }}>{label}</div>
                <div className="font-mono" style={{ fontSize: 16, fontWeight: 700, color }}>{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right column */}
        <div>
          <div style={SECTION_LABEL as React.CSSProperties}>Valuation Multiples</div>
          <div style={{ overflowX: "auto", marginBottom: 16 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, textAlign: "left", paddingLeft: 0 }}>Metric</th>
                  {colHeaders.map((h) => <th key={h} style={thStyle}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {valuationRows.map((row) => (
                  <tr key={row.label}>
                    <td style={{ ...tdStyle, textAlign: "left", paddingLeft: 0, color: "#64748B", fontWeight: 600, fontFamily: "Inter, sans-serif", fontSize: 11 }}>{row.label}</td>
                    {row.cols.map((val, i) => (
                      <td key={i} style={tdStyle}>{row.label === "ROE" ? (val !== null ? fmtPct(val) : "—") : (val !== null ? fmtX(val) : "—")}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={SECTION_LABEL as React.CSSProperties}>EBITDA &amp; Net Income Estimates</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, textAlign: "left", paddingLeft: 0 }}>Item</th>
                  {["LTM", "2026E", "2027E"].map((h) => <th key={h} style={thStyle}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {estimateRows.map((row) => (
                  <tr key={row.label}>
                    <td style={{ ...tdStyle, textAlign: "left", paddingLeft: 0, color: "#64748B", fontWeight: 600, fontFamily: "Inter, sans-serif", fontSize: 11 }}>{row.label}</td>
                    {row.cols.map((val, i) => <td key={i} style={tdStyle}>{fmtMM(val)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 4 }}>Values in MM CLP</div>
        </div>
      </div>
    </div>
  );
}
