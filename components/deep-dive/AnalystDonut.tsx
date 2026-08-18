"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import type { AnalystRecSnap } from "@/app/api/companies/[ticker]/route";
import { FONT_SECONDARY } from "@/lib/patriaTheme";

interface Props {
  analystRec: AnalystRecSnap | null;
  targetPrice?: number | null;
  currentPrice?: number | null;
}

const COLORS = {
  buy:  { fill: "#001EAF", bg: "rgba(0,30,175,0.10)",  border: "rgba(0,30,175,0.25)"  },
  hold: { fill: "#FF6B06", bg: "rgba(255,107,6,0.10)",  border: "rgba(255,107,6,0.25)"  },
  sell: { fill: "#F8485E", bg: "rgba(248,72,94,0.10)",  border: "rgba(248,72,94,0.25)"  },
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
        border: "1px solid rgba(13,13,56,0.10)",
        borderRadius: 6,
        padding: "6px 10px",
        fontSize: 11,
        fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums",
        boxShadow: "0 4px 12px rgba(13,13,56,0.10)",
      }}
    >
      <span style={{ fontWeight: 600 }}>{d.name}</span>: {d.value}
    </div>
  );
}

export default function AnalystDonut({ analystRec, targetPrice, currentPrice }: Props) {
  if (!analystRec) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "rgba(13,13,56,0.28)", fontSize: 12 }}>
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
        <span style={{ fontSize: 13, fontWeight: 600, color: "#FF6B06", letterSpacing: "0.06em" }}>
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
            <span style={{ fontSize: 16, fontWeight: 700, color: "#0D0D38", fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums" }}>
              {totAnalysts}
            </span>
            <span style={{ fontSize: 11, color: "rgba(13,13,56,0.45)" }}>analysts</span>
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
                    fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums",
                    minWidth: 40,
                    textAlign: "center",
                  }}
                >
                  {label}
                </span>
                <div style={{ flex: 1, margin: "0 8px", height: 4, borderRadius: 2, background: "rgba(13,13,56,0.06)" }}>
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
                <span style={{ fontSize: 12, fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums", color: "#0D0D38", minWidth: 20, textAlign: "right" }}>
                  {value}
                </span>
              </div>
            ))}
          </div>

          {/* Consensus + Target */}
          {consenso && (
            <div style={{ fontSize: 13, color: "rgba(13,13,56,0.62)", marginBottom: 5 }}>
              Consensus: <strong style={{ color: "#0D0D38" }}>{consenso}</strong>
            </div>
          )}
          {targetPrice != null && (
            <div
              style={{
                fontSize: 12,
                color: "rgba(13,13,56,0.62)",
                marginBottom: 4,
                paddingTop: 6,
                borderTop: "1px solid rgba(13,13,56,0.07)",
              }}
            >
              Target price:{" "}
              <strong
                style={{
                  fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums",
                  color: "#0D0D38",
                }}
              >
                ${targetPrice.toFixed(2)}
              </strong>
            </div>
          )}
          {upside !== null && (
            <div style={{ fontSize: 12, color: "rgba(13,13,56,0.62)" }}>
              Target upside:{" "}
              <strong
                style={{
                  fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums",
                  fontSize: 12,
                  color: upside >= 0 ? "#001EAF" : "#F8485E",
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
