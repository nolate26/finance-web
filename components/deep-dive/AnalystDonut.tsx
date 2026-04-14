"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import type { AnalystRecSnap } from "@/app/api/companies/[ticker]/route";

interface Props {
  analystRec: AnalystRecSnap | null;
  targetPrice?: number | null;
  currentPrice?: number | null;
}

const COLORS = {
  buy:  { fill: "#059669", bg: "rgba(5,150,105,0.10)",  border: "rgba(5,150,105,0.25)"  },
  hold: { fill: "#D97706", bg: "rgba(217,119,6,0.10)",  border: "rgba(217,119,6,0.25)"  },
  sell: { fill: "#DC2626", bg: "rgba(220,38,38,0.10)",  border: "rgba(220,38,38,0.25)"  },
};

interface SlicePayload {
  name: string;
  value: number;
}

function SliceTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: SlicePayload }[];
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid rgba(15,23,42,0.10)",
        borderRadius: 6,
        padding: "6px 10px",
        fontSize: 11,
        fontFamily: "JetBrains Mono, monospace",
        boxShadow: "0 4px 12px rgba(15,23,42,0.10)",
      }}
    >
      <span style={{ fontWeight: 600 }}>{d.name}</span>: {d.value}
    </div>
  );
}

export default function AnalystDonut({ analystRec, targetPrice, currentPrice }: Props) {
  if (!analystRec) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#CBD5E1", fontSize: 12 }}>
        No analyst data
      </div>
    );
  }

  const { buy, hold, sell, totAnalysts, consenso } = analystRec;

  const pieData = [
    { name: "Buy",  value: buy,  color: COLORS.buy.fill  },
    { name: "Hold", value: hold, color: COLORS.hold.fill },
    { name: "Sell", value: sell, color: COLORS.sell.fill },
  ].filter((d) => d.value > 0);

  const upside =
    targetPrice != null && currentPrice != null && currentPrice > 0
      ? ((targetPrice - currentPrice) / currentPrice) * 100
      : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#D97706", letterSpacing: "0.06em" }}>
          Analyst Recommendations
        </span>
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "center", flex: 1 }}>
        {/* Donut chart */}
        <div style={{ position: "relative", width: 140, height: 140, flexShrink: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={60}
                dataKey="value"
                strokeWidth={2}
                stroke="#fff"
                isAnimationActive={false}
              >
                {pieData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<SliceTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          {/* Center label */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
            }}
          >
            <span style={{ fontSize: 16, fontWeight: 700, color: "#0F172A", fontFamily: "JetBrains Mono, monospace" }}>
              {totAnalysts}
            </span>
            <span style={{ fontSize: 11, color: "#94A3B8" }}>analysts</span>
          </div>
        </div>

        {/* Legend + Stats */}
        <div style={{ flex: 1 }}>
          {/* Rec chips */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
            {[
              { label: "Buy",  value: buy,  c: COLORS.buy  },
              { label: "Hold", value: hold, c: COLORS.hold },
              { label: "Sell", value: sell, c: COLORS.sell },
            ].map(({ label, value, c }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: 4,
                    background: c.bg,
                    color: c.fill,
                    border: `1px solid ${c.border}`,
                    fontFamily: "JetBrains Mono, monospace",
                    minWidth: 40,
                    textAlign: "center",
                  }}
                >
                  {label}
                </span>
                <div style={{ flex: 1, margin: "0 8px", height: 4, borderRadius: 2, background: "rgba(15,23,42,0.06)" }}>
                  <div
                    style={{
                      width: totAnalysts > 0 ? `${(value / totAnalysts) * 100}%` : "0%",
                      height: "100%",
                      borderRadius: 2,
                      background: c.fill,
                      opacity: 0.7,
                    }}
                  />
                </div>
                <span style={{ fontSize: 12, fontFamily: "JetBrains Mono, monospace", color: "#334155", minWidth: 20, textAlign: "right" }}>
                  {value}
                </span>
              </div>
            ))}
          </div>

          {/* Consensus + Target */}
          {consenso && (
            <div style={{ fontSize: 13, color: "#64748B", marginBottom: 5 }}>
              Consensus: <strong style={{ color: "#0F172A" }}>{consenso}</strong>
            </div>
          )}
          {targetPrice != null && (
            <div
              style={{
                fontSize: 12,
                color: "#64748B",
                marginBottom: 4,
                paddingTop: 6,
                borderTop: "1px solid rgba(15,23,42,0.07)",
              }}
            >
              Target price:{" "}
              <strong
                style={{
                  fontFamily: "JetBrains Mono, monospace",
                  color: "#0F172A",
                }}
              >
                ${targetPrice.toFixed(2)}
              </strong>
            </div>
          )}
          {upside !== null && (
            <div style={{ fontSize: 12, color: "#64748B" }}>
              Target upside:{" "}
              <strong
                style={{
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize: 12,
                  color: upside >= 0 ? "#059669" : "#DC2626",
                }}
              >
                {upside >= 0 ? "+" : ""}
                {upside.toFixed(1)}%
              </strong>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
