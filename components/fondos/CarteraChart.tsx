"use client";

import { PATRIA, FONT_SECONDARY } from "@/lib/patriaTheme";

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
        background: "#FFFFFF",
        border: "1px solid rgba(13,13,56,0.12)",
        boxShadow: "0 4px 16px rgba(13,13,56,0.12)",
        minWidth: 200,
      }}
    >
      <div className="font-semibold mb-2" style={{ color: "#0D0D38" }}>{label}</div>
      <div className="space-y-1">
        <div className="flex justify-between gap-6">
          <span style={{ color: "rgba(13,13,56,0.62)" }}>Portafolio</span>
          <span className="font-secondary tabular-nums font-semibold" style={{ color: "#2044DC" }}>
            {(row.portfolioPct * 100).toFixed(2)}%
          </span>
        </div>
        <div className="flex justify-between gap-6">
          <span style={{ color: "rgba(13,13,56,0.62)" }}>Benchmark</span>
          <span className="font-secondary tabular-nums" style={{ color: "rgba(13,13,56,0.62)" }}>
            {(row.benchmarkPct * 100).toFixed(2)}%
          </span>
        </div>
        <div className="flex justify-between gap-6 pt-1 border-t" style={{ borderColor: "rgba(13,13,56,0.08)" }}>
          <span style={{ color: "rgba(13,13,56,0.62)" }}>Overweight</span>
          <span className="font-secondary tabular-nums font-bold"
            style={{ color: row.overweight >= 0 ? "#001EAF" : "#F8485E" }}
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
    company: r.company.length > 26 ? r.company.slice(0, 24) + "…" : r.company,
    companyFull: r.company,
    overweightPct: r.overweight * 100,
    portfolioPct100: r.portfolioPct * 100,
    benchmarkPct100: r.benchmarkPct * 100,
  }));

  const maxOver = Math.max(...chartData.map(d => Math.abs(d.overweightPct)));
  const domainMax = Math.ceil(maxOver * 1.15 * 10) / 10;

  return (
    <div className="card overflow-hidden flex flex-col">
      <div className="px-5 py-4"
        style={{ background: PATRIA.darkBlue }}>
        <h2 className="text-sm font-bold font-primary uppercase tracking-wide" style={{ color: PATRIA.white }}>Overweight / Underweight — {fondoName}</h2>
        <p className="text-xs mt-0.5 font-secondary" style={{ color: "rgba(255,255,255,0.72)" }}>
          Desviación del portafolio respecto al benchmark {benchmark} (puntos porcentuales)
        </p>
      </div>

      <div style={{ height: Math.max(400, chartData.length * 35 + 60) }} className="px-2 py-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 0, right: 20, left: 8, bottom: 0 }}
            barCategoryGap="20%"
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(13,13,56,0.06)" horizontal={false} />
            <XAxis
              type="number"
              domain={[-domainMax, domainMax]}
              tick={{ fill: "rgba(13,13,56,0.45)", fontSize: 10, fontFamily: FONT_SECONDARY }}
              axisLine={false}
              tickLine={false}
              tickFormatter={v => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`}
            />
            <YAxis
              type="category"
              dataKey="company"
              tick={{ fill: "rgba(13,13,56,0.62)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={180}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(32,68,220,0.04)" }} />
            <ReferenceLine x={0} stroke="rgba(13,13,56,0.3)" strokeWidth={1} />
            <Bar dataKey="overweightPct" radius={[0, 3, 3, 0]}>
              {chartData.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.overweightPct >= 0 ? "#001EAF" : "#F8485E"}
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
