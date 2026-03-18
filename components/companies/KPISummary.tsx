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
    .map((c) => c.Fv_ebitda_ltm)
    .filter((v): v is number => typeof v === "number");
  const medianEbitda = median(ebitdaValues);

  const ret1yValues = companies
    .map((c) => c.ret_1y)
    .filter((v): v is number => typeof v === "number");
  const avgRet1y = average(ret1yValues);

  const buyCount = companies.filter((c) => (c.recomendacion as string) === "Comprar").length;
  const holdCount = companies.filter((c) => (c.recomendacion as string) === "Mantener").length;
  const sellCount = companies.filter((c) => (c.recomendacion as string) === "Vender").length;

  const cards = [
    {
      icon: Building2,
      label: "Companies Tracked",
      value: totalCount.toLocaleString("en-US"),
      iconColor: "#3B82F6",
      iconBg: "rgba(59,130,246,0.12)",
    },
    {
      icon: DollarSign,
      label: "Total Market Cap",
      value: Math.round(totalMktCap).toLocaleString("en-US") + " MM CLP",
      iconColor: "#06B6D4",
      iconBg: "rgba(6,182,212,0.12)",
    },
    {
      icon: BarChart2,
      label: "Median FV/EBITDA LTM",
      value: medianEbitda !== null ? medianEbitda.toFixed(1) + "x" : "—",
      iconColor: "#8B5CF6",
      iconBg: "rgba(139,92,246,0.12)",
    },
    {
      icon: TrendingUp,
      label: "Avg 1Y Return",
      value:
        avgRet1y !== null
          ? (avgRet1y >= 0 ? "+" : "") + (avgRet1y * 100).toFixed(1) + "%"
          : "—",
      valueColor:
        avgRet1y === null ? "#94A3B8" : avgRet1y >= 0 ? "#10B981" : "#EF4444",
      iconColor: avgRet1y === null ? "#94A3B8" : avgRet1y >= 0 ? "#10B981" : "#EF4444",
      iconBg:
        avgRet1y === null
          ? "rgba(148,163,184,0.08)"
          : avgRet1y >= 0
          ? "rgba(16,185,129,0.12)"
          : "rgba(239,68,68,0.12)",
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
            <div style={{ fontSize: 11, color: "#475569", marginBottom: 4 }}>{label}</div>
            <div
              className="font-mono"
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: valueColor ?? "#E2E8F0",
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
            background: "rgba(245,158,11,0.12)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Target size={18} style={{ color: "#F59E0B" }} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#475569", marginBottom: 6 }}>Recommendations</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <span
              className="font-mono"
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: "2px 8px",
                borderRadius: 20,
                background: "rgba(16,185,129,0.12)",
                color: "#10B981",
                border: "1px solid rgba(16,185,129,0.25)",
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
                background: "rgba(245,158,11,0.12)",
                color: "#F59E0B",
                border: "1px solid rgba(245,158,11,0.25)",
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
                background: "rgba(239,68,68,0.12)",
                color: "#EF4444",
                border: "1px solid rgba(239,68,68,0.25)",
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
