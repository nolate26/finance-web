"use client";

import { useMemo } from "react";
import type { ConsensusPoint } from "@/app/api/companies/[ticker]/route";
import { PATRIA, FONT_SECONDARY } from "@/lib/patriaTheme";
import { PatriaTitle } from "@/components/patria/PatriaTitle";

interface Props {
  data: ConsensusPoint[];
}

// The metrics we want to show (in order)
const METRIC_ORDER = [
  "SALES",
  "EBITDA",
  "EBIT",
  "NET_INCOME",
  "EPS",
  "DPS",
  "BPS",
];

function fmtVal(v: number): string {
  if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
  if (Math.abs(v) >= 1_000) return (v / 1_000).toFixed(1) + "K";
  return v.toFixed(2);
}

function prettyMetric(m: string): string {
  const map: Record<string, string> = {
    SALES: "Revenue",
    EBITDA: "EBITDA",
    EBIT: "EBIT",
    NET_INCOME: "Net Income",
    EPS: "EPS",
    DPS: "DPS",
    BPS: "Book Value/Sh",
  };
  return map[m] ?? m.replace(/_/g, " ");
}

export default function ConsensusTable({ data }: Props) {
  // Pivot: latest date per (metric, period) combination
  const tableData = useMemo(() => {
    // Group by metric + period → take the most recent date
    const map = new Map<string, ConsensusPoint>();
    for (const row of data) {
      const key = `${row.metric}|||${row.period}`;
      const existing = map.get(key);
      if (!existing || row.date > existing.date) {
        map.set(key, row);
      }
    }

    // Collect distinct metrics and periods
    const metricsInData = new Set<string>();
    const periodsInData = new Set<string>();
    for (const r of map.values()) {
      metricsInData.add(r.metric);
      periodsInData.add(r.period);
    }

    // Sort metrics by preferred order, then alphabetically for unknowns
    const sortedMetrics = [
      ...METRIC_ORDER.filter((m) => metricsInData.has(m)),
      ...[...metricsInData].filter((m) => !METRIC_ORDER.includes(m)).sort(),
    ];

    // Sort periods: 1FY before 2FY
    const sortedPeriods = [...periodsInData].sort();

    // Build row data
    const rows = sortedMetrics.map((metric) => {
      const values: Record<string, number | null> = {};
      for (const period of sortedPeriods) {
        const key = `${metric}|||${period}`;
        const r = map.get(key);
        values[period] = r ? r.value : null;
      }
      return { metric, values };
    });

    return { rows, periods: sortedPeriods };
  }, [data]);

  const { rows, periods } = tableData;

  if (rows.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "rgba(13,13,56,0.28)", fontSize: 12 }}>
        No consensus estimates available
      </div>
    );
  }

  const thSt: React.CSSProperties = {
    padding: "6px 12px",
    textAlign: "right",
    fontSize: 10,
    fontFamily: FONT_SECONDARY,
    fontWeight: 700,
    color: PATRIA.kingBlue,
    borderBottom: "1px solid rgba(13,13,56,0.08)",
    letterSpacing: "0.04em",
    whiteSpace: "nowrap",
  };
  const tdSt: React.CSSProperties = {
    padding: "6px 12px",
    textAlign: "right",
    fontSize: 11,
    fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums",
    color: "#0D0D38",
    borderBottom: "1px solid rgba(13,13,56,0.05)",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PatriaTitle style={{ marginBottom: 8, borderRadius: 6 }}>
        Consensus Estimates — Latest Snapshot
      </PatriaTitle>
      <div style={{ overflowX: "auto", flex: 1 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "#F5F7FD" }}>
              <th style={{ ...thSt, textAlign: "left", color: PATRIA.kingBlue }}>Metric</th>
              {periods.map((p) => (
                <th key={p} style={thSt}>{p}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.metric}
                style={{ background: i % 2 === 1 ? "rgba(13,13,56,0.022)" : "transparent" }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "rgba(32,68,220,0.04)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background =
                    i % 2 === 1 ? "rgba(13,13,56,0.022)" : "transparent";
                }}
              >
                <td
                  style={{
                    ...tdSt,
                    textAlign: "left",
                    fontFamily: FONT_SECONDARY,
                    fontWeight: 700,
                    color: PATRIA.kingBlue,
                    fontSize: 11,
                  }}
                >
                  {prettyMetric(row.metric)}
                </td>
                {periods.map((p) => {
                  const v = row.values[p];
                  return (
                    <td key={p} style={tdSt}>
                      {v !== null ? fmtVal(v) : <span style={{ color: "rgba(13,13,56,0.28)" }}>—</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
