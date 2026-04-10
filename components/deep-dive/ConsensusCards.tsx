"use client";

import { useMemo } from "react";
import type { ConsensusPoint } from "@/app/api/companies/[ticker]/route";

// ── Config ────────────────────────────────────────────────────────────────────

interface CardCfg {
  label:   string;
  aliases: string[];   // DB values that map to this card
  color:   string;
  bg:      string;
  border:  string;
}

const CARDS: CardCfg[] = [
  {
    label:   "Revenue",
    aliases: ["REVENUE", "SALES"],
    color:   "#059669",
    bg:      "rgba(5,150,105,0.05)",
    border:  "rgba(5,150,105,0.14)",
  },
  {
    label:   "EBITDA",
    aliases: ["EBITDA"],
    color:   "#2B5CE0",
    bg:      "rgba(43,92,224,0.05)",
    border:  "rgba(43,92,224,0.14)",
  },
  {
    label:   "Net Income",
    aliases: ["NET_INCOME"],
    color:   "#7C3AED",
    bg:      "rgba(124,58,237,0.05)",
    border:  "rgba(124,58,237,0.14)",
  },
];

// ── Formatter ─────────────────────────────────────────────────────────────────

function fmtCompact(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e9) return (v / 1e9).toFixed(1) + "B";
  if (abs >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (abs >= 1e3) return (v / 1e3).toFixed(1) + "K";
  return v.toFixed(1);
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface PeriodValues {
  "1FY": number | null;
  "2FY": number | null;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  data: ConsensusPoint[];
}

export default function ConsensusCards({ data }: Props) {
  // For each card, get the LATEST snapshot value for 1FY and 2FY
  const cardValues = useMemo(() => {
    // Build map: normalisedKey ("REVENUE"|"EBITDA"|"NET_INCOME") + period → latest value
    const latest = new Map<string, number>();

    for (const row of data) {
      const metricUp = row.metric.toUpperCase();
      if (row.period !== "1FY" && row.period !== "2FY") continue;

      // Find which card this metric belongs to
      const card = CARDS.find((c) => c.aliases.includes(metricUp));
      if (!card) continue;

      const key = `${card.label}|||${row.period}`;
      const existing = latest.get(key);

      // Keep the most recent date (ISO string comparison works for YYYY-MM-DD)
      if (existing === undefined) {
        latest.set(key, row.value);
      } else {
        // Compare dates — we need the raw date to track which is more recent
        // Re-scan to find: use a secondary map for dates
        // (handled via the dateMap below — see full approach)
      }
    }

    // Proper approach: track both value AND date per key
    const snap = new Map<string, { value: number; date: string }>();
    for (const row of data) {
      const metricUp = row.metric.toUpperCase();
      if (row.period !== "1FY" && row.period !== "2FY") continue;

      const card = CARDS.find((c) => c.aliases.includes(metricUp));
      if (!card) continue;

      const key = `${card.label}|||${row.period}`;
      const existing = snap.get(key);
      if (!existing || row.date > existing.date) {
        snap.set(key, { value: row.value, date: row.date });
      }
    }

    // Assemble result per card
    const result: Record<string, PeriodValues> = {};
    for (const card of CARDS) {
      const fy1 = snap.get(`${card.label}|||1FY`);
      const fy2 = snap.get(`${card.label}|||2FY`);
      result[card.label] = {
        "1FY": fy1?.value ?? null,
        "2FY": fy2?.value ?? null,
      };
    }
    return result;
  }, [data]);

  const hasAnyData = CARDS.some((c) => {
    const v = cardValues[c.label];
    return v?.["1FY"] !== null || v?.["2FY"] !== null;
  });

  if (!hasAnyData) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: "100%", color: "#CBD5E1", fontSize: 12,
      }}>
        No consensus estimates available
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

      {/* Header */}
      <div style={{ marginBottom: 12 }}>
        <span style={{
          fontSize: 10, fontWeight: 700, color: "#64748B",
          letterSpacing: "0.07em", textTransform: "uppercase",
        }}>
          Consensus Estimates — Latest Snapshot
        </span>
      </div>

      {/* 3-column card grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 10,
        flex: 1,
      }}>
        {CARDS.map((card) => {
          const vals = cardValues[card.label];
          const fy1  = vals?.["1FY"] ?? null;
          const fy2  = vals?.["2FY"] ?? null;

          // Growth arrow between 1FY → 2FY
          const growth =
            fy1 !== null && fy2 !== null && fy1 !== 0
              ? ((fy2 - fy1) / Math.abs(fy1)) * 100
              : null;

          return (
            <div
              key={card.label}
              style={{
                background: card.bg,
                border: `1px solid ${card.border}`,
                borderRadius: 10,
                padding: "12px 14px",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              {/* Card title */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.10em",
                  textTransform: "uppercase",
                  color: card.color,
                }}>
                  {card.label}
                </span>
                {growth !== null && (
                  <span style={{
                    fontSize: 9,
                    fontWeight: 700,
                    fontFamily: "JetBrains Mono, monospace",
                    color: growth >= 0 ? "#059669" : "#DC2626",
                  }}>
                    {growth >= 0 ? "▲" : "▼"} {Math.abs(growth).toFixed(1)}%
                  </span>
                )}
              </div>

              {/* Divider */}
              <div style={{ borderTop: `1px solid ${card.border}` }} />

              {/* Period rows */}
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {(["1FY", "2FY"] as const).map((period) => {
                  const v = vals?.[period] ?? null;
                  return (
                    <div
                      key={period}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <span style={{
                        fontSize: 10,
                        color: "#94A3B8",
                        fontFamily: "JetBrains Mono, monospace",
                        fontWeight: 500,
                      }}>
                        {period}
                      </span>
                      <span style={{
                        fontSize: 13,
                        fontWeight: 700,
                        fontFamily: "JetBrains Mono, monospace",
                        color: v !== null ? card.color : "#CBD5E1",
                      }}>
                        {v !== null ? fmtCompact(v) : "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
