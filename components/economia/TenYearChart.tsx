"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

interface TenYearRow {
  Date: string;
  [key: string]: string | number | null;
}

interface Props {
  history: TenYearRow[];
  country: string;
}

function getColumns(country: string): { yieldCol: string; fxCol: string; fxLabel: string } {
  if (country === "United States") {
    return {
      yieldCol: "United States - 10Y Yield (%)",
      fxCol: "US - DXY Index",
      fxLabel: "DXY Index",
    };
  }
  return {
    yieldCol: `${country} - 10Y Yield (%)`,
    fxCol: `${country} - FX Spot`,
    fxLabel: "FX Spot",
  };
}

// Format date as MM/YY — compact, no overlap risk
function fmtDateMMYY(d: string): string {
  const parts = d.slice(0, 10).split("-");
  return `${parts[1]}/${parts[0].slice(2)}`;
}

interface FilledPoint {
  date: string;
  yield: number | null;
  fx: number | null;
}

// Forward fill two series independently; drop leading rows where both are still null
function forwardFillTwo(
  rows: TenYearRow[],
  yieldCol: string,
  fxCol: string
): FilledPoint[] {
  let lastYield: number | null = null;
  let lastFx: number | null = null;
  const result: FilledPoint[] = [];

  for (const row of rows) {
    const y = typeof row[yieldCol] === "number" ? (row[yieldCol] as number) : null;
    const f = typeof row[fxCol] === "number" ? (row[fxCol] as number) : null;
    if (y !== null) lastYield = y;
    if (f !== null) lastFx = f;

    // Skip leading rows before we have any data at all
    if (lastYield === null && lastFx === null) continue;

    result.push({
      date: fmtDateMMYY(row.Date as string),
      yield: lastYield,
      fx: lastFx,
    });
  }

  return result;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-lg px-3 py-2 text-xs"
      style={{
        background: "#FFFFFF",
        border: "1px solid rgba(15,23,42,0.12)",
        boxShadow: "0 4px 16px rgba(15,23,42,0.12)",
        minWidth: 160,
      }}
    >
      <div className="font-mono mb-2" style={{ color: "#64748B" }}>{label}</div>
      {payload.map((p: { name: string; value: number; color: string }) => (
        <div key={p.name} className="flex items-center justify-between gap-4 mb-0.5">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-mono font-semibold" style={{ color: "#0F172A" }}>
            {typeof p.value === "number" ? p.value.toFixed(3) : "—"}
          </span>
        </div>
      ))}
    </div>
  );
};

export default function TenYearChart({ history, country }: Props) {
  const { yieldCol, fxCol, fxLabel } = getColumns(country);

  // Forward fill both series, drop leading nulls
  const filled = forwardFillTwo(history, yieldCol, fxCol);

  // Downsample for performance (max 300 points)
  const step = Math.max(1, Math.floor(filled.length / 300));
  const chartData = filled.filter((_, i) => i % step === 0 || i === filled.length - 1);

  const title = `${country}: Tasa 10Y vs ${fxLabel}`;

  return (
    <div className="card flex flex-col overflow-hidden h-full">
      {/* Header */}
      <div
        className="px-5 py-3 border-b flex items-center justify-between"
        style={{ borderColor: "rgba(15,23,42,0.07)" }}
      >
        <div>
          <h3 className="text-sm font-semibold" style={{ color: "#0F172A" }}>{title}</h3>
          <p className="text-xs mt-0.5" style={{ color: "#64748B" }}>
            Eje izquierdo: Yield % · Eje derecho: {fxLabel}
          </p>
        </div>
      </div>

      {/* Chart */}
      <div className="px-2 py-4 flex-1" style={{ minHeight: 300 }}>
        {chartData.length === 0 ? (
          <div
            className="flex items-center justify-center h-full"
            style={{ color: "#64748B", fontSize: 13 }}
          >
            No hay datos para {country}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 52, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.06)" />
              <XAxis
                dataKey="date"
                tick={{ fill: "#64748B", fontSize: 11, fontFamily: "monospace", dy: 10 }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={40}
                tickFormatter={(v: unknown) => (typeof v === "string" && v.length > 0 ? v : "")}
              />

              {/* Left Y: Yield — auto domain, no zero anchoring */}
              <YAxis
                yAxisId="left"
                domain={["auto", "auto"]}
                tick={{ fill: "#1E3A8A", fontSize: 9, fontFamily: "monospace" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${v}%`}
                width={44}
              />

              {/* Right Y: FX — auto domain, formatted per magnitude */}
              <YAxis
                yAxisId="right"
                orientation="right"
                domain={["auto", "auto"]}
                tick={{ fill: "#DC2626", fontSize: 9, fontFamily: "monospace" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) =>
                  v >= 1000
                    ? v.toLocaleString("en-US", { maximumFractionDigits: 0 })
                    : v.toFixed(2)
                }
                width={52}
              />

              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: 10, color: "#64748B", paddingTop: 4 }}
                formatter={(value) => (value === "yield" ? "10Y Yield (%)" : fxLabel)}
              />

              {/* Yield line — blue */}
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="yield"
                name="yield"
                stroke="#1E3A8A"
                strokeWidth={1.5}
                dot={false}
                activeDot={{ r: 4, fill: "#1E3A8A", stroke: "#FFFFFF", strokeWidth: 2 }}
              />

              {/* FX line — red */}
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="fx"
                name="fx"
                stroke="#EF4444"
                strokeWidth={1.5}
                dot={false}
                activeDot={{ r: 4, fill: "#EF4444", stroke: "#FFFFFF", strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="flex justify-end px-5 pb-3">
        <span className="text-xs" style={{ color: "#CBD5E1" }}>Fuente: Bloomberg</span>
      </div>
    </div>
  );
}
