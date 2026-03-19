"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";

interface HistoryRow {
  date: string;
  [key: string]: number | string;
}

interface ResumenRow {
  Index: string;
  "Today (P/E)": number;
  "Hist. Avg": number;
  "+1 Std": number;
  "-1 Std": number;
  Discount: string;
}

interface Props {
  allHistory: HistoryRow[];
  selectedIndex: string;
  resumen: ResumenRow[];
  period: "1Y" | "3Y" | "5Y";
  onPeriodChange: (p: "1Y" | "3Y" | "5Y") => void;
}

const PERIODS = [
  { label: "1A", value: "1Y" as const, rows: 252 },
  { label: "3A", value: "3Y" as const, rows: 756 },
  { label: "5A", value: "5Y" as const, rows: 9999 },
];

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("es-CL", { month: "short", year: "2-digit" });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const val = payload[0]?.value;
  return (
    <div className="rounded-lg px-3 py-2 text-xs"
      style={{
        background: "#09103A",
        border: "1px solid rgba(43,92,224,0.3)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
      }}
    >
      <div className="font-mono mb-1" style={{ color: "#475569" }}>{label}</div>
      <div className="font-semibold" style={{ color: "#5080FF" }}>
        P/E: {typeof val === "number" ? val.toFixed(2) : "—"}x
      </div>
    </div>
  );
};

export default function PEHistoryChart({
  allHistory, selectedIndex, resumen, period, onPeriodChange
}: Props) {
  const meta = resumen.find(r => r.Index === selectedIndex);
  const periodRows = PERIODS.find(p => p.value === period)?.rows ?? 252;

  const chartData = allHistory
    .slice(-periodRows)
    .filter(row => row[selectedIndex] != null)
    .map(row => ({
      date: formatDate(row.date as string),
      rawDate: row.date,
      value: row[selectedIndex] as number,
    }));

  // Downsample for performance (max 300 points)
  const step = Math.max(1, Math.floor(chartData.length / 300));
  const sampled = chartData.filter((_, i) => i % step === 0 || i === chartData.length - 1);

  const discVal = meta ? parseFloat(meta.Discount) : 0;
  const discColor = discVal > 10 ? "#10B981" : discVal < -10 ? "#EF4444" : "#F59E0B";
  const currentPE = meta?.["Today (P/E)"];
  const histAvg = meta?.["Hist. Avg"];

  return (
    <div className="card flex flex-col gap-0 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b flex items-start justify-between gap-4"
        style={{ borderColor: "rgba(43,92,224,0.12)" }}
      >
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-white">
              Historial P/E — {selectedIndex}
            </h2>
            {meta && (
              <span className="text-xs font-mono px-2 py-0.5 rounded-full font-semibold"
                style={{ color: discColor, background: `${discColor}18`, border: `1px solid ${discColor}30` }}
              >
                {discVal > 0 ? "+" : ""}{meta.Discount}
              </span>
            )}
          </div>
          <p className="text-xs mt-0.5" style={{ color: "#475569" }}>
            Selecciona un índice en la tabla para cambiar la vista
          </p>
        </div>

        {/* Stats */}
        {meta && (
          <div className="flex gap-4 text-xs shrink-0">
            <div className="text-right">
              <div style={{ color: "#475569" }}>P/E Actual</div>
              <div className="font-mono font-bold text-white text-base">{currentPE?.toFixed(1)}x</div>
            </div>
            <div className="text-right">
              <div style={{ color: "#475569" }}>Prom. Hist.</div>
              <div className="font-mono font-semibold" style={{ color: "#94A3B8" }}>{histAvg?.toFixed(1)}x</div>
            </div>
            <div className="text-right">
              <div style={{ color: "#475569" }}>+1σ / -1σ</div>
              <div className="font-mono" style={{ color: "#64748B" }}>
                {meta["+1 Std"]?.toFixed(1)} / {meta["-1 Std"]?.toFixed(1)}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Period selector */}
      <div className="flex gap-1 px-5 pt-3">
        {PERIODS.map(p => (
          <button
            key={p.value}
            onClick={() => onPeriodChange(p.value)}
            className="px-3 py-1 text-xs font-mono rounded transition-all"
            style={{
              background: period === p.value ? "rgba(43,92,224,0.2)" : "transparent",
              color: period === p.value ? "#2B5CE0" : "#475569",
              border: `1px solid ${period === p.value ? "rgba(43,92,224,0.4)" : "transparent"}`,
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="px-2 pb-4 pt-2" style={{ height: 240 }}>
        {sampled.length === 0 ? (
          <div className="flex items-center justify-center h-full" style={{ color: "#475569" }}>
            No hay datos para {selectedIndex}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sampled} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(43,92,224,0.07)" />
              <XAxis
                dataKey="date"
                tick={{ fill: "#475569", fontSize: 10, fontFamily: "monospace" }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: "#475569", fontSize: 10, fontFamily: "monospace" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={v => `${v}x`}
                width={40}
              />
              <Tooltip content={<CustomTooltip />} />

              {/* Reference lines */}
              {meta && (
                <>
                  <ReferenceLine y={meta["Hist. Avg"]} stroke="rgba(148,163,184,0.4)" strokeDasharray="4 4" />
                  <ReferenceLine y={meta["+1 Std"]} stroke="rgba(239,68,68,0.25)" strokeDasharray="3 3" />
                  <ReferenceLine y={meta["-1 Std"]} stroke="rgba(16,185,129,0.25)" strokeDasharray="3 3" />
                </>
              )}

              <Line
                type="monotone"
                dataKey="value"
                stroke="#5080FF"
                strokeWidth={1.5}
                dot={false}
                activeDot={{ r: 4, fill: "#5080FF", stroke: "#09103A", strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {meta && (
        <div className="px-5 pb-4 flex gap-4 text-[10px]" style={{ color: "#2D3E6E" }}>
          <span className="flex items-center gap-1">
            <span className="w-4 h-px inline-block" style={{ background: "rgba(148,163,184,0.4)", borderTop: "1px dashed" }} />
            Prom. Hist.
          </span>
          <span className="flex items-center gap-1">
            <span className="w-4 h-px inline-block" style={{ background: "rgba(239,68,68,0.4)", borderTop: "1px dashed" }} />
            +1σ
          </span>
          <span className="flex items-center gap-1">
            <span className="w-4 h-px inline-block" style={{ background: "rgba(16,185,129,0.4)", borderTop: "1px dashed" }} />
            -1σ
          </span>
        </div>
      )}
    </div>
  );
}
