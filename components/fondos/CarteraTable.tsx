"use client";

interface CarteraRow {
  company: string;
  portfolioPct: number;
  benchmarkPct: number;
  overweight: number;
  sector: string;
  delta1W: number | null;
  delta1M: number | null;
}

interface Props {
  cartera: CarteraRow[];
  benchmark: string;
}

function fmtDelta(v: number | null): { text: string; color: string; bg: string } {
  if (v === null) return { text: "—", color: "#CBD5E1", bg: "transparent" };
  const pct = v * 100;
  if (Math.abs(pct) < 0.005) return { text: "0.00%", color: "#94A3B8", bg: "transparent" };
  const text = (pct > 0 ? "+" : "") + pct.toFixed(2) + "%";
  const color = pct > 0 ? "#10B981" : "#EF4444";
  const bg = pct > 0 ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)";
  return { text, color, bg };
}

export default function CarteraTable({ cartera, benchmark }: Props) {
  const sorted = [...cartera].sort((a, b) => b.overweight - a.overweight);

  const hasDelta1W = cartera.some((r) => r.delta1W !== null);
  const hasDelta1M = cartera.some((r) => r.delta1M !== null);

  return (
    <div className="card overflow-hidden flex flex-col h-full">
      <div className="px-5 py-4 border-b flex items-center justify-between"
        style={{ borderColor: "rgba(15,23,42,0.07)" }}
      >
        <div>
          <h2 className="text-sm font-semibold" style={{ color: "#0F172A" }}>Detalle Cartera</h2>
          <p className="text-xs mt-0.5" style={{ color: "#64748B" }}>
            Ordenado por overweight vs {benchmark}
          </p>
        </div>
        <span className="text-xs font-mono px-2 py-0.5 rounded"
          style={{ background: "rgba(43,92,224,0.08)", color: "#2B5CE0" }}
        >
          {cartera.length} posiciones
        </span>
      </div>
      <div className="overflow-y-auto flex-1 min-h-0 max-h-[500px] md:max-h-none">
        <table className="w-full text-xs whitespace-nowrap">
          <thead className="sticky top-0 z-10" style={{ background: "#F0F4FA" }}>
            <tr>
              <th className="px-3 py-2.5 text-left font-medium w-8"
                style={{ color: "#64748B", borderBottom: "1px solid rgba(15,23,42,0.07)" }}>#</th>
              <th className="px-3 py-2.5 text-left font-medium w-44"
                style={{ color: "#64748B", borderBottom: "1px solid rgba(15,23,42,0.07)" }}>Empresa</th>
              <th className="px-3 py-2.5 text-right font-medium w-28"
                style={{ color: "#64748B", borderBottom: "1px solid rgba(15,23,42,0.07)" }}>% Port.</th>
              <th className="px-3 py-2.5 text-right font-medium w-20"
                style={{ color: "#64748B", borderBottom: "1px solid rgba(15,23,42,0.07)" }}>% {benchmark}</th>
              <th className="px-3 py-2.5 text-right font-medium w-24"
                style={{ color: "#64748B", borderBottom: "1px solid rgba(15,23,42,0.07)" }}>Overweight</th>
              {hasDelta1W && (
                <th className="px-3 py-2.5 text-right font-medium w-20"
                  style={{ color: "#64748B", borderBottom: "1px solid rgba(15,23,42,0.07)" }}>Δ 1W</th>
              )}
              {hasDelta1M && (
                <th className="px-3 py-2.5 text-right font-medium w-20"
                  style={{ color: "#64748B", borderBottom: "1px solid rgba(15,23,42,0.07)" }}>Δ 1M</th>
              )}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => {
              const over = row.overweight * 100;
              const overColor = over > 0 ? "#059669" : over < 0 ? "#DC2626" : "#64748B";
              const d1w = fmtDelta(row.delta1W);
              const d1m = fmtDelta(row.delta1M);

              return (
                <tr
                  key={i}
                  className="border-t transition-colors"
                  style={{ borderColor: "rgba(15,23,42,0.05)" }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(43,92,224,0.03)"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
                >
                  <td className="px-3 py-2 font-mono" style={{ color: "#94A3B8" }}>{i + 1}</td>

                  <td className="px-3 py-2 font-medium" style={{ color: "#0F172A" }}>
                    {row.company}
                  </td>

                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-12 h-1.5 rounded-full" style={{ background: "rgba(43,92,224,0.10)" }}>
                        <div className="h-full rounded-full"
                          style={{
                            width: `${Math.min(100, row.portfolioPct * 500)}%`,
                            background: "linear-gradient(90deg, #2B5CE0, #3D6FE8)",
                          }}
                        />
                      </div>
                      <span className="font-mono font-semibold" style={{ color: "#0F172A" }}>
                        {(row.portfolioPct * 100).toFixed(2)}%
                      </span>
                    </div>
                  </td>

                  <td className="px-3 py-2 font-mono text-right" style={{ color: "#64748B" }}>
                    {(row.benchmarkPct * 100).toFixed(2)}%
                  </td>

                  <td className="px-3 py-2 text-right">
                    <span className="font-mono font-bold text-[11px] px-2 py-0.5 rounded-full"
                      style={{ color: overColor, background: `${overColor}12`, border: `1px solid ${overColor}28` }}
                    >
                      {over > 0 ? "+" : ""}{over.toFixed(2)}%
                    </span>
                  </td>

                  {hasDelta1W && (
                    <td className="px-3 py-2 text-right">
                      <span className="font-mono font-semibold text-[11px] px-1.5 py-0.5 rounded"
                        style={{ color: d1w.color, background: d1w.bg }}
                      >
                        {d1w.text}
                      </span>
                    </td>
                  )}

                  {hasDelta1M && (
                    <td className="px-3 py-2 text-right">
                      <span className="font-mono font-semibold text-[11px] px-1.5 py-0.5 rounded"
                        style={{ color: d1m.color, background: d1m.bg }}
                      >
                        {d1m.text}
                      </span>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
