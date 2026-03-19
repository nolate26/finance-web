"use client";

interface CarteraRow {
  company: string;
  portfolioPct: number;
  benchmarkPct: number;
  overweight: number;
  industria: string;
  analista: string;
  top_pick: string;
  observacion: string;
}

interface Props {
  cartera: CarteraRow[];
  benchmark: string;
}

export default function CarteraTable({ cartera, benchmark }: Props) {
  const sorted = [...cartera].sort((a, b) => b.overweight - a.overweight);

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b flex items-center justify-between"
        style={{ borderColor: "rgba(43,92,224,0.12)" }}
      >
        <div>
          <h2 className="text-sm font-semibold text-white">Detalle Cartera</h2>
          <p className="text-xs mt-0.5" style={{ color: "#475569" }}>
            Ordenado por overweight vs {benchmark}
          </p>
        </div>
        <span className="text-xs font-mono px-2 py-0.5 rounded"
          style={{ background: "rgba(43,92,224,0.08)", color: "#2B5CE0" }}
        >
          {cartera.length} posiciones
        </span>
      </div>
      <div className="overflow-auto max-h-[600px]">
        <table className="w-full text-xs whitespace-nowrap">
          <thead className="sticky top-0 z-10" style={{ background: "rgba(9,16,58,0.98)" }}>
            <tr>
              {[
                { label: "#", w: "w-8" },
                { label: "Empresa", w: "w-44" },
                { label: "% Port.", w: "w-28" },
                { label: `% ${benchmark}`, w: "w-20" },
                { label: "Overweight", w: "w-24" },
                { label: "Industria", w: "w-28" },
                { label: "Analista", w: "w-24" },
                { label: "Top Pick", w: "w-20" },
                { label: "Observación", w: "" },
              ].map(({ label, w }) => (
                <th key={label}
                  className={`px-3 py-2.5 text-left font-medium ${w}`}
                  style={{ color: "#475569", borderBottom: "1px solid rgba(43,92,224,0.12)" }}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => {
              const over = row.overweight * 100;
              const overColor = over > 0 ? "#10B981" : over < 0 ? "#EF4444" : "#94A3B8";
              const hasObservacion = row.observacion?.trim();

              return (
                <tr
                  key={i}
                  className="border-t transition-colors"
                  style={{ borderColor: "rgba(43,92,224,0.07)" }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(43,92,224,0.04)"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
                >
                  {/* # */}
                  <td className="px-3 py-2 font-mono" style={{ color: "#2D3E6E" }}>{i + 1}</td>

                  {/* Empresa */}
                  <td className="px-3 py-2 font-medium" style={{ color: "#EEF2FF" }}>
                    {row.company}
                  </td>

                  {/* % Portfolio */}
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 rounded-full" style={{ background: "rgba(43,92,224,0.08)" }}>
                        <div className="h-full rounded-full"
                          style={{
                            width: `${Math.min(100, row.portfolioPct * 500)}%`,
                            background: "linear-gradient(90deg, #2B5CE0, #5080FF)",
                          }}
                        />
                      </div>
                      <span className="font-mono text-white font-semibold">
                        {(row.portfolioPct * 100).toFixed(2)}%
                      </span>
                    </div>
                  </td>

                  {/* % Benchmark */}
                  <td className="px-3 py-2 font-mono" style={{ color: "#64748B" }}>
                    {(row.benchmarkPct * 100).toFixed(2)}%
                  </td>

                  {/* Overweight */}
                  <td className="px-3 py-2">
                    <span className="font-mono font-bold text-[11px] px-2 py-0.5 rounded-full"
                      style={{ color: overColor, background: `${overColor}14`, border: `1px solid ${overColor}30` }}
                    >
                      {over > 0 ? "+" : ""}{over.toFixed(2)}%
                    </span>
                  </td>

                  {/* Industria */}
                  <td className="px-3 py-2">
                    {row.industria ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium"
                        style={{ background: "rgba(80,128,255,0.1)", color: "#5080FF", border: "1px solid rgba(80,128,255,0.2)" }}
                      >
                        {row.industria}
                      </span>
                    ) : (
                      <span style={{ color: "#0F1A5C" }}>—</span>
                    )}
                  </td>

                  {/* Analista */}
                  <td className="px-3 py-2" style={{ color: row.analista ? "#94A3B8" : "#0F1A5C" }}>
                    {row.analista || "—"}
                  </td>

                  {/* Top Pick */}
                  <td className="px-3 py-2 text-center">
                    {row.top_pick?.toLowerCase() === "si" || row.top_pick?.toLowerCase() === "sí" || row.top_pick === "1" || row.top_pick?.toLowerCase() === "true" ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
                        style={{ background: "rgba(245,158,11,0.15)", color: "#F59E0B", border: "1px solid rgba(245,158,11,0.3)" }}
                      >
                        ★ TOP
                      </span>
                    ) : (
                      <span style={{ color: "#0F1A5C" }}>—</span>
                    )}
                  </td>

                  {/* Observación */}
                  <td className="px-3 py-2 max-w-xs" style={{ color: hasObservacion ? "#94A3B8" : "#0F1A5C" }}>
                    {hasObservacion ? (
                      <span title={row.observacion} className="block truncate max-w-[220px] cursor-help">
                        {row.observacion}
                      </span>
                    ) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
