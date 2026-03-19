"use client";

interface ResumenRow {
  Index: string;
  "Today (P/E)": number;
  "Hist. Avg": number;
  "+1 Std": number;
  "-1 Std": number;
  Discount: string;
}

interface Props {
  data: ResumenRow[];
  onSelectIndex: (idx: string) => void;
  selectedIndex: string;
}

function discountColor(discount: string) {
  const val = parseFloat(discount);
  if (isNaN(val)) return "#94A3B8";
  if (val > 10) return "#10B981";
  if (val < -10) return "#EF4444";
  return "#F59E0B";
}

function peBar(today: number, histAvg: number, plus1: number, minus1: number) {
  const min = Math.min(minus1, today, 0);
  const max = Math.max(plus1, today) * 1.1;
  const range = max - min;
  const todayPct = ((today - min) / range) * 100;
  const avgPct = ((histAvg - min) / range) * 100;
  const lowPct = ((minus1 - min) / range) * 100;
  const highPct = ((plus1 - min) / range) * 100;

  return { todayPct, avgPct, lowPct, highPct };
}

export default function ValuationTable({ data, onSelectIndex, selectedIndex }: Props) {
  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b flex items-center justify-between"
        style={{ borderColor: "rgba(43,92,224,0.12)" }}
      >
        <div>
          <h2 className="text-sm font-semibold text-white">Valuación P/E</h2>
          <p className="text-xs mt-0.5" style={{ color: "#475569" }}>
            Precio/Utilidad actual vs histórico — click para ver historial
          </p>
        </div>
        <span className="text-xs font-mono px-2 py-1 rounded"
          style={{ background: "rgba(43,92,224,0.08)", color: "#2B5CE0" }}
        >
          {data.length} índices
        </span>
      </div>
      <div className="overflow-auto">
        <table className="w-full text-xs">
          <thead>
            <tr style={{ background: "rgba(13,24,82,0.8)" }}>
              {["Índice", "P/E Hoy", "Prom. Hist.", "Rango ±1σ", "Descuento"].map(h => (
                <th key={h} className="px-4 py-2.5 text-left font-medium tracking-wide"
                  style={{ color: "#475569" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => {
              const active = selectedIndex === row.Index;
              const discColor = discountColor(row.Discount);
              const discVal = parseFloat(row.Discount);
              const { todayPct, avgPct, lowPct, highPct } = peBar(
                row["Today (P/E)"],
                row["Hist. Avg"],
                row["+1 Std"],
                row["-1 Std"]
              );

              return (
                <tr
                  key={i}
                  onClick={() => onSelectIndex(row.Index)}
                  className="cursor-pointer transition-all duration-150 border-t"
                  style={{
                    borderColor: "rgba(43,92,224,0.07)",
                    background: active ? "rgba(43,92,224,0.08)" : "transparent",
                  }}
                  onMouseEnter={e => {
                    if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(43,92,224,0.04)";
                  }}
                  onMouseLeave={e => {
                    if (!active) (e.currentTarget as HTMLElement).style.background = "transparent";
                  }}
                >
                  <td className="px-4 py-2.5 font-medium" style={{ color: active ? "#fff" : "#C5D4FF" }}>
                    <div className="flex items-center gap-2">
                      {active && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />}
                      {row.Index}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 font-mono font-semibold" style={{ color: "#EEF2FF" }}>
                    {row["Today (P/E)"]?.toFixed(1)}x
                  </td>
                  <td className="px-4 py-2.5 font-mono" style={{ color: "#94A3B8" }}>
                    {row["Hist. Avg"]?.toFixed(1)}x
                  </td>
                  <td className="px-4 py-2.5 w-36">
                    {/* Mini bar chart */}
                    <div className="relative h-4 rounded-sm overflow-hidden"
                      style={{ background: "rgba(255,255,255,0.04)" }}
                    >
                      {/* std range band */}
                      <div className="absolute top-0 bottom-0 rounded-sm"
                        style={{
                          left: `${lowPct}%`,
                          width: `${highPct - lowPct}%`,
                          background: "rgba(43,92,224,0.12)",
                        }}
                      />
                      {/* avg line */}
                      <div className="absolute top-0 bottom-0 w-px"
                        style={{ left: `${avgPct}%`, background: "rgba(148,163,184,0.5)" }}
                      />
                      {/* today dot */}
                      <div className="absolute top-1 bottom-1 w-1.5 rounded-sm"
                        style={{ left: `${todayPct}%`, background: discColor }}
                      />
                    </div>
                    <div className="flex justify-between mt-0.5 text-[10px]"
                      style={{ color: "#2D3E6E" }}
                    >
                      <span>{row["-1 Std"]?.toFixed(0)}</span>
                      <span>{row["+1 Std"]?.toFixed(0)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="font-mono font-semibold text-[11px] px-2 py-0.5 rounded-full"
                      style={{
                        color: discColor,
                        background: `${discColor}18`,
                        border: `1px solid ${discColor}30`,
                      }}
                    >
                      {discVal > 0 ? "+" : ""}{row.Discount}
                    </span>
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
