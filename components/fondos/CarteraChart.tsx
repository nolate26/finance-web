"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
} from "recharts";

interface CarteraRow {
  company: string;
  portfolioPct: number;
  benchmarkPct: number;
  overweight: number;
}

interface Props {
  cartera: CarteraRow[];
  fondoName: string;
  benchmark: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as CarteraRow;
  return (
    <div className="rounded-lg px-3 py-2.5 text-xs"
      style={{
        background: "#09103A",
        border: "1px solid rgba(43,92,224,0.3)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        minWidth: 200,
      }}
    >
      <div className="font-semibold text-white mb-2">{label}</div>
      <div className="space-y-1">
        <div className="flex justify-between gap-6">
          <span style={{ color: "#475569" }}>Portafolio</span>
          <span className="font-mono font-semibold" style={{ color: "#2B5CE0" }}>
            {(row.portfolioPct * 100).toFixed(2)}%
          </span>
        </div>
        <div className="flex justify-between gap-6">
          <span style={{ color: "#475569" }}>Benchmark</span>
          <span className="font-mono" style={{ color: "#94A3B8" }}>
            {(row.benchmarkPct * 100).toFixed(2)}%
          </span>
        </div>
        <div className="flex justify-between gap-6 pt-1 border-t" style={{ borderColor: "rgba(43,92,224,0.15)" }}>
          <span style={{ color: "#475569" }}>Overweight</span>
          <span className="font-mono font-bold"
            style={{ color: row.overweight >= 0 ? "#10B981" : "#EF4444" }}
          >
            {row.overweight >= 0 ? "+" : ""}{(row.overweight * 100).toFixed(2)}%
          </span>
        </div>
      </div>
    </div>
  );
};

export default function CarteraChart({ cartera, fondoName, benchmark }: Props) {
  // Sort by overweight descending
  const sorted = [...cartera].sort((a, b) => b.overweight - a.overweight);

  const chartData = sorted.map(r => ({
    ...r,
    company: r.company.length > 18 ? r.company.slice(0, 16) + "…" : r.company,
    companyFull: r.company,
    overweightPct: r.overweight * 100,
    portfolioPct100: r.portfolioPct * 100,
    benchmarkPct100: r.benchmarkPct * 100,
  }));

  const maxOver = Math.max(...chartData.map(d => Math.abs(d.overweightPct)));
  const domainMax = Math.ceil(maxOver * 1.15 * 10) / 10;

  return (
    <div className="card overflow-hidden flex flex-col">
      <div className="px-5 py-4 border-b" style={{ borderColor: "rgba(43,92,224,0.12)" }}>
        <h2 className="text-sm font-semibold text-white">Overweight / Underweight — {fondoName}</h2>
        <p className="text-xs mt-0.5" style={{ color: "#475569" }}>
          Desviación del portafolio respecto al benchmark {benchmark} (puntos porcentuales)
        </p>
      </div>

      <div style={{ height: Math.max(400, chartData.length * 26 + 60) }} className="px-2 py-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 0, right: 20, left: 120, bottom: 0 }}
            barCategoryGap="20%"
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(43,92,224,0.07)" horizontal={false} />
            <XAxis
              type="number"
              domain={[-domainMax, domainMax]}
              tick={{ fill: "#475569", fontSize: 10, fontFamily: "monospace" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={v => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`}
            />
            <YAxis
              type="category"
              dataKey="company"
              tick={{ fill: "#94A3B8", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={115}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(43,92,224,0.04)" }} />
            <ReferenceLine x={0} stroke="rgba(148,163,184,0.3)" strokeWidth={1} />
            <Bar dataKey="overweightPct" radius={[0, 3, 3, 0]}>
              {chartData.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.overweightPct >= 0 ? "#10B981" : "#EF4444"}
                  fillOpacity={0.75}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
