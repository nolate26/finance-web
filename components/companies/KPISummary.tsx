"use client";

import { Building2, DollarSign, BarChart2, TrendingUp, Target } from "lucide-react";
import { Company } from "@/lib/companies";

interface Props {
  companies: Company[];
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export default function KPISummary({ companies }: Props) {
  const totalCount = companies.length;

  const totalMktCap = companies.reduce(
    (sum, c) => sum + (typeof c.mkt_cap_bn === "number" ? c.mkt_cap_bn : 0),
    0
  );

  const ebitdaValues = companies
    .map((c) => c.fv_ebitda_ltm)
    .filter((v): v is number => typeof v === "number");
  const medianEbitda = median(ebitdaValues);

  const ret1yValues = companies
    .map((c) => c.ret_1y)
    .filter((v): v is number => typeof v === "number");
  const avgRet1y = average(ret1yValues);

  const buyCount = companies.filter((c) => c.recommendation === "Comprar").length;
  const holdCount = companies.filter((c) => c.recommendation === "Mantener").length;
  const sellCount = companies.filter((c) => c.recommendation === "Vender").length;

  const cards = [
    {
      icon: Building2,
      label: "Companies Tracked",
      value: totalCount.toLocaleString("en-US"),
      iconColor: "#2B5CE0",
      iconBg: "rgba(43,92,224,0.08)",
    },
    {
      icon: DollarSign,
      label: "Total Market Cap",
      value: Math.round(totalMktCap).toLocaleString("en-US") + " MM CLP",
      iconColor: "#3D6FE8",
      iconBg: "rgba(61,111,232,0.08)",
    },
    {
      icon: BarChart2,
      label: "Median FV/EBITDA LTM",
      value: medianEbitda !== null ? medianEbitda.toFixed(1) + "x" : "—",
      iconColor: "#7C3AED",
      iconBg: "rgba(124,58,237,0.08)",
    },
    {
      icon: TrendingUp,
      label: "Avg 1Y Return",
      value:
        avgRet1y !== null
          ? (avgRet1y >= 0 ? "+" : "") + (avgRet1y * 100).toFixed(1) + "%"
          : "—",
      valueColor:
        avgRet1y === null ? "#64748B" : avgRet1y >= 0 ? "#059669" : "#DC2626",
      iconColor: avgRet1y === null ? "#64748B" : avgRet1y >= 0 ? "#059669" : "#DC2626",
      iconBg:
        avgRet1y === null
          ? "rgba(100,116,139,0.08)"
          : avgRet1y >= 0
          ? "rgba(5,150,105,0.08)"
          : "rgba(220,38,38,0.08)",
    },
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(5, 1fr)",
        gap: "12px",
        marginBottom: "20px",
      }}
    >
      {cards.map(({ icon: Icon, label, value, iconColor, iconBg, valueColor }) => (
        <div
          key={label}
          className="card"
          style={{ padding: "16px 20px", display: "flex", alignItems: "flex-start", gap: "14px" }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: iconBg,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Icon size={18} style={{ color: iconColor }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4 }}>{label}</div>
            <div
              className="font-mono"
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: valueColor ?? "#0F172A",
                lineHeight: 1.2,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {value}
            </div>
          </div>
        </div>
      ))}

      {/* Recommendations card */}
      <div
        className="card"
        style={{ padding: "16px 20px", display: "flex", alignItems: "flex-start", gap: "14px" }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: "rgba(217,119,6,0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Target size={18} style={{ color: "#D97706" }} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#64748B", marginBottom: 6 }}>Recommendations</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <span
              className="font-mono"
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: "2px 8px",
                borderRadius: 20,
                background: "rgba(5,150,105,0.10)",
                color: "#059669",
                border: "1px solid rgba(5,150,105,0.20)",
              }}
            >
              Buy {buyCount}
            </span>
            <span
              className="font-mono"
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: "2px 8px",
                borderRadius: 20,
                background: "rgba(217,119,6,0.10)",
                color: "#D97706",
                border: "1px solid rgba(217,119,6,0.20)",
              }}
            >
              Hold {holdCount}
            </span>
            <span
              className="font-mono"
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: "2px 8px",
                borderRadius: 20,
                background: "rgba(220,38,38,0.10)",
                color: "#DC2626",
                border: "1px solid rgba(220,38,38,0.20)",
              }}
            >
              Sell {sellCount}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
