"use client";

import { useEffect, useState } from "react";
import {
  ComposedChart,
  Line,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  ReferenceLine,
} from "recharts";
import type { AttributionRow, HistoryPoint } from "@/app/api/fondos/attribution/route";

interface ApiResponse {
  fund: string;
  currentDate: string;
  currentPeriod: AttributionRow[];
  history: Record<string, HistoryPoint[]>;
}

interface Props {
  fundId: string | undefined;
  displayName: string;
}

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtPct(v: number | null | number, decimals = 2): string {
  if (v === null || v === undefined) return "—";
  return (v * 100).toFixed(decimals) + "%";
}

function fmtDate(iso: string): string {
  const [y, m] = iso.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[parseInt(m) - 1]} '${y.slice(2)}`;
}

function fmtFullDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[parseInt(m) - 1]} ${parseInt(d)}, ${y}`;
}

// ── Color helpers ─────────────────────────────────────────────────────────────

function pctColor(v: number | null): string {
  if (v === null) return "#CBD5E1";
  if (v > 0) return "#10B981";
  if (v < 0) return "#EF4444";
  return "#64748B";
}

function deltaClass(v: number | null): string {
  if (v === null) return "text-slate-400";
  if (v > 0) return "text-emerald-600";
  if (v < 0) return "text-red-600";
  return "text-slate-500";
}

// ── Column definitions ────────────────────────────────────────────────────────

const COLS = [
  { label: "SECURITY",     width: 220, right: false },
  { label: "FUND WT",      width: 80,  right: true  },
  { label: "Δ WEIGHT",     width: 80,  right: true  },
  { label: "BENCH WT",     width: 80,  right: true  },
  { label: "ACTIVE WT",    width: 80,  right: true  },
  { label: "ALLOC EFF",    width: 80,  right: true  },
  { label: "SELECT EFF",   width: 88,  right: true  },
  { label: "TOTAL EFF",    width: 80,  right: true  },
  { label: "Δ TOTAL EFF",  width: 88,  right: true  },
];
const NCOLS = COLS.length;

// ── Drill-down chart ──────────────────────────────────────────────────────────

function StoryChart({ data }: { data: HistoryPoint[] }) {
  if (data.length === 0) return null;
  return (
    <div style={{ height: 220, padding: "8px 16px 0" }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 40, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
          <XAxis
            dataKey="date"
            tickFormatter={fmtDate}
            tick={{ fontSize: 10, fill: "#94A3B8" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            yAxisId="left"
            tickFormatter={(v) => fmtPct(v, 1)}
            tick={{ fontSize: 10, fill: "#94A3B8" }}
            axisLine={false}
            tickLine={false}
            width={52}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tickFormatter={(v) => fmtPct(v, 2)}
            tick={{ fontSize: 10, fill: "#94A3B8" }}
            axisLine={false}
            tickLine={false}
            width={60}
          />
          <Tooltip
            formatter={(value: number, name: string) => [fmtPct(value, 2), name]}
            labelFormatter={(label) => fmtDate(String(label))}
            contentStyle={{
              fontSize: 11,
              border: "1px solid #E2E8F0",
              borderRadius: 6,
              boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
            }}
          />
          <Legend wrapperStyle={{ fontSize: 10, paddingTop: 4 }} />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="weight"
            name="Fund Weight"
            stroke="#1E3A8A"
            strokeWidth={3}
            dot={{ r: 4, fill: "#1E3A8A" }}
            connectNulls
            isAnimationActive={false}
          />
          <Bar yAxisId="right" dataKey="totalEffect" name="Total Effect" isAnimationActive={false}>
            {data.map((entry, i) => (
              <Cell
                key={`cell-${i}`}
                fill={(entry.totalEffect ?? 0) >= 0 ? "#10B981" : "#EF4444"}
              />
            ))}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Conviction Matrix tooltip ─────────────────────────────────────────────────

function MatrixTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: AttributionRow }>;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div
      className="bg-white shadow-lg border border-slate-200 rounded"
      style={{ padding: "10px 14px", fontSize: 12, minWidth: 180 }}
    >
      <p style={{ fontWeight: 700, color: "#0F172A", marginBottom: 6 }}>
        {row.security}
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "3px 12px" }}>
        <span style={{ color: "#64748B" }}>Active Weight</span>
        <span style={{ fontWeight: 600, color: pctColor(row.activeWeight), textAlign: "right" }}>
          {fmtPct(row.activeWeight)}
        </span>
        <span style={{ color: "#64748B" }}>Total Effect</span>
        <span style={{ fontWeight: 600, color: pctColor(row.totalEffect), textAlign: "right" }}>
          {fmtPct(row.totalEffect)}
        </span>
        <span style={{ color: "#64748B" }}>Fund Weight</span>
        <span style={{ fontWeight: 500, color: "#475569", textAlign: "right" }}>
          {fmtPct(row.fundWeight)}
        </span>
      </div>
    </div>
  );
}

// ── Conviction Matrix (ScatterChart) ──────────────────────────────────────────

function ConvictionMatrix({ rows }: { rows: AttributionRow[] }) {
  // Filter out nulls — scatter needs both axes to be a number
  const valid = rows.filter(
    (r): r is AttributionRow & { activeWeight: number; totalEffect: number } =>
      r.activeWeight !== null && r.totalEffect !== null
  );

  // Compute padded axis domains so extreme points aren't clipped
  const xVals = valid.map((r) => r.activeWeight);
  const yVals = valid.map((r) => r.totalEffect);
  const PAD = 0.01; // 1 pp padding
  const xMin = Math.min(...xVals) - PAD;
  const xMax = Math.max(...xVals) + PAD;
  const yMin = Math.min(...yVals) - PAD;
  const yMax = Math.max(...yVals) + PAD;

  // Quadrant labels: corners of the plot area
  const quadrants = [
    { x: xMax, y: yMax, label: "HIGH CONVICTION · POSITIVE α", anchor: "end",   fill: "#10B981" },
    { x: xMin, y: yMax, label: "LOW CONVICTION · POSITIVE α",  anchor: "start", fill: "#10B981" },
    { x: xMax, y: yMin, label: "HIGH CONVICTION · NEGATIVE α", anchor: "end",   fill: "#EF4444" },
    { x: xMin, y: yMin, label: "LOW CONVICTION · NEGATIVE α",  anchor: "start", fill: "#EF4444" },
  ];

  return (
    <div style={{ height: 560, padding: "12px 16px 8px" }}>
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 24, right: 40, bottom: 32, left: 16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
          <XAxis
            type="number"
            dataKey="activeWeight"
            name="Active Weight"
            tickFormatter={(v) => fmtPct(v, 1)}
            tick={{ fontSize: 10, fill: "#94A3B8" }}
            axisLine={{ stroke: "#E2E8F0" }}
            tickLine={false}
            domain={[xMin, xMax]}
            label={{
              value: "Active Weight →",
              position: "insideBottomRight",
              offset: -4,
              style: { fontSize: 10, fill: "#94A3B8" },
            }}
          />
          <YAxis
            type="number"
            dataKey="totalEffect"
            name="Alpha Generated"
            tickFormatter={(v) => fmtPct(v, 2)}
            tick={{ fontSize: 10, fill: "#94A3B8" }}
            axisLine={{ stroke: "#E2E8F0" }}
            tickLine={false}
            domain={[yMin, yMax]}
            label={{
              value: "Alpha (Total Effect) →",
              angle: -90,
              position: "insideTopLeft",
              offset: 16,
              style: { fontSize: 10, fill: "#94A3B8" },
            }}
          />
          <Tooltip content={<MatrixTooltip />} />

          {/* Quadrant dividers */}
          <ReferenceLine x={0} stroke="#64748B" strokeDasharray="4 3" strokeWidth={1.5} />
          <ReferenceLine y={0} stroke="#64748B" strokeDasharray="4 3" strokeWidth={1.5} />

          {/* Quadrant corner labels via reference lines with labels */}
          {quadrants.map(({ x, y, label, anchor, fill }) => (
            <ReferenceLine
              key={label}
              x={x}
              stroke="none"
              label={{
                value: label,
                position: x === xMax ? "insideTopRight" : "insideTopLeft",
                style: { fontSize: 8, fill, fontWeight: 600, letterSpacing: "0.06em" },
              }}
            />
          ))}

          <Scatter data={valid} isAnimationActive={false}>
            {valid.map((entry, i) => (
              <Cell
                key={`dot-${i}`}
                fill={(entry.totalEffect ?? 0) > 0 ? "#10B981" : "#EF4444"}
                fillOpacity={0.85}
                stroke={(entry.totalEffect ?? 0) > 0 ? "#059669" : "#DC2626"}
                strokeWidth={1}
                r={6}
              />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PerformanceAttribution({ fundId, displayName }: Props) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"table" | "matrix">("table");

  useEffect(() => {
    if (!fundId) return;
    setLoading(true);
    setError(null);
    setExpandedRow(null);
    fetch(`/api/fondos/attribution?fund=${encodeURIComponent(fundId)}`)
      .then((r) => r.json())
      .then((d: ApiResponse) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => {
        setError("Could not load attribution data");
        setLoading(false);
      });
  }, [fundId]);

  if (!fundId) {
    return (
      <div className="card flex flex-col items-center justify-center gap-3" style={{ minHeight: 200 }}>
        <p style={{ color: "#94A3B8", fontSize: 13 }}>
          No attribution data available for {displayName}.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="card flex items-center justify-center" style={{ height: 180 }}>
        <div
          className="w-7 h-7 rounded-full border-2 animate-spin"
          style={{ borderColor: "rgba(43,92,224,0.15)", borderTopColor: "#2B5CE0" }}
        />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="card flex flex-col items-center justify-center gap-2" style={{ minHeight: 180 }}>
        <p style={{ color: "#EF4444", fontSize: 13 }}>{error ?? "No data"}</p>
      </div>
    );
  }

  // Default sort: totalEffect descending, nulls last
  const sorted = [...data.currentPeriod].sort((a, b) => {
    if (a.totalEffect === null) return 1;
    if (b.totalEffect === null) return -1;
    return b.totalEffect - a.totalEffect;
  });

  return (
    <div className="card" style={{ overflow: "hidden", padding: 0 }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div
        style={{
          padding: "10px 18px",
          borderBottom: "1px solid rgba(15,23,42,0.07)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 600, color: "#64748B", letterSpacing: "0.08em" }}>
          PERFORMANCE ATTRIBUTION — {displayName.toUpperCase()}
        </span>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 10, color: "#CBD5E1" }}>
            as of {fmtFullDate(data.currentDate)} · MoM Δ vs prev period
          </span>

          {/* Segmented control toggle */}
          <div
            style={{
              display: "flex",
              background: "rgba(15,23,42,0.05)",
              border: "1px solid rgba(15,23,42,0.10)",
              borderRadius: 7,
              padding: 3,
              gap: 2,
            }}
          >
            {(["table", "matrix"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                style={{
                  padding: "4px 12px",
                  borderRadius: 5,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                  border: "none",
                  transition: "all 0.15s",
                  background:
                    viewMode === mode ? "#fff" : "transparent",
                  color:
                    viewMode === mode ? "#1E3A8A" : "#94A3B8",
                  boxShadow:
                    viewMode === mode
                      ? "0 1px 4px rgba(15,23,42,0.12)"
                      : "none",
                }}
              >
                {mode === "table" ? "Data Table" : "Conviction Matrix"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Table view ─────────────────────────────────────────────────────── */}
      {viewMode === "table" && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#F0F4FA" }}>
                <th style={{ width: 32, padding: "8px 6px" }} />
                {COLS.map((col) => (
                  <th
                    key={col.label}
                    style={{
                      padding: "8px 12px",
                      textAlign: col.right ? "right" : "left",
                      fontSize: 9,
                      fontWeight: 600,
                      color: "#64748B",
                      letterSpacing: "0.08em",
                      minWidth: col.width,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, i) => {
                const isExpanded = expandedRow === row.security;
                const rowBg = i % 2 === 0 ? "#ffffff" : "#F9FAFB";
                const historyData = data.history[row.security] ?? [];
                return (
                  <>
                    <tr
                      key={row.security}
                      style={{
                        background: rowBg,
                        borderBottom: isExpanded ? "none" : "1px solid rgba(15,23,42,0.04)",
                        cursor: "pointer",
                      }}
                      onClick={() =>
                        setExpandedRow((prev) =>
                          prev === row.security ? null : row.security
                        )
                      }
                    >
                      {/* Expand toggle */}
                      <td style={{ padding: "9px 6px", textAlign: "center", fontSize: 10, color: "#94A3B8", background: rowBg, userSelect: "none" }}>
                        {isExpanded ? "▲" : "▼"}
                      </td>
                      {/* Security */}
                      <td style={{ padding: "9px 12px", fontSize: 12, fontWeight: 500, color: "#1E3A8A", whiteSpace: "nowrap", minWidth: 220 }}>
                        {row.security}
                      </td>
                      {/* Fund Weight */}
                      <td style={{ padding: "9px 12px", textAlign: "right", fontFamily: "monospace", fontSize: 12, color: "#475569", whiteSpace: "nowrap" }}>
                        {fmtPct(row.fundWeight)}
                      </td>
                      {/* Δ Weight */}
                      <td className={deltaClass(row.deltaWeight)} style={{ padding: "9px 12px", textAlign: "right", fontFamily: "monospace", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>
                        {fmtPct(row.deltaWeight)}
                      </td>
                      {/* Bench Weight */}
                      <td style={{ padding: "9px 12px", textAlign: "right", fontFamily: "monospace", fontSize: 12, color: "#475569", whiteSpace: "nowrap" }}>
                        {fmtPct(row.benchWeight)}
                      </td>
                      {/* Active Weight */}
                      <td style={{ padding: "9px 12px", textAlign: "right", fontFamily: "monospace", fontSize: 12, fontWeight: 500, color: pctColor(row.activeWeight), whiteSpace: "nowrap" }}>
                        {fmtPct(row.activeWeight)}
                      </td>
                      {/* Alloc Effect */}
                      <td style={{ padding: "9px 12px", textAlign: "right", fontFamily: "monospace", fontSize: 12, color: "#475569", whiteSpace: "nowrap" }}>
                        {fmtPct(row.allocEffect)}
                      </td>
                      {/* Select Effect */}
                      <td style={{ padding: "9px 12px", textAlign: "right", fontFamily: "monospace", fontSize: 12, color: "#475569", whiteSpace: "nowrap" }}>
                        {fmtPct(row.selectEffect)}
                      </td>
                      {/* Total Effect */}
                      <td style={{ padding: "9px 12px", textAlign: "right", fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: pctColor(row.totalEffect), whiteSpace: "nowrap" }}>
                        {fmtPct(row.totalEffect)}
                      </td>
                      {/* Δ Total Effect */}
                      <td className={deltaClass(row.deltaTotalEffect)} style={{ padding: "9px 12px", textAlign: "right", fontFamily: "monospace", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>
                        {fmtPct(row.deltaTotalEffect)}
                      </td>
                    </tr>

                    {/* Drill-down panel */}
                    {isExpanded && (
                      <tr key={`${row.security}-drill`} style={{ background: rowBg }}>
                        <td
                          colSpan={NCOLS + 1}
                          className="bg-slate-50 border-y border-slate-200"
                          style={{ padding: "12px 16px 16px" }}
                        >
                          <div style={{ fontSize: 10, fontWeight: 600, color: "#94A3B8", letterSpacing: "0.08em", marginBottom: 8 }}>
                            STORY OF A STOCK — {row.security}
                          </div>
                          {historyData.length > 0 ? (
                            <StoryChart data={historyData} />
                          ) : (
                            <p style={{ fontSize: 12, color: "#CBD5E1", textAlign: "center", padding: "20px 0" }}>
                              No historical data available.
                            </p>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Matrix view ────────────────────────────────────────────────────── */}
      {viewMode === "matrix" && (
        <>
          {/* Quadrant legend */}
          <div
            style={{
              padding: "8px 18px 0",
              display: "flex",
              gap: 24,
              flexWrap: "wrap",
            }}
          >
            {[
              { color: "#10B981", label: "Positive alpha  (Total Effect > 0)" },
              { color: "#EF4444", label: "Negative alpha  (Total Effect ≤ 0)" },
            ].map(({ color, label }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: color }} />
                <span style={{ fontSize: 10, color: "#64748B" }}>{label}</span>
              </div>
            ))}
            <span style={{ fontSize: 10, color: "#CBD5E1", marginLeft: "auto" }}>
              X axis = Active Weight (Fund − Bench) · Y axis = Alpha Generated
            </span>
          </div>
          <ConvictionMatrix rows={sorted} />
        </>
      )}
    </div>
  );
}
