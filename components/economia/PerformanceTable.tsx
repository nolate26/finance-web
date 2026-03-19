"use client";

interface TablaRow {
  Ticker: string;
  Index_Name: string;
  "Price (USD)": number;
  "1W": string;
  "1M": string;
  "3M": string;
  YTD: string;
  "1Y": string;
  "3Y": string;
  "5Y": string;
  "EV/EBITDA NTM": number | null;
  "P/U NTM": number | null;
  ROE: string;
}

interface Props {
  data: TablaRow[];
}

function pctColor(val: string) {
  const n = parseFloat(val);
  if (isNaN(n)) return "#94A3B8";
  if (n > 0) return "#10B981";
  if (n < 0) return "#EF4444";
  return "#94A3B8";
}

function pctCell(val: string) {
  const color = pctColor(val);
  const n = parseFloat(val);
  return (
    <span
      className="font-mono text-[11px] font-semibold px-1.5 py-0.5 rounded"
      style={{
        color,
        background: `${color}14`,
      }}
    >
      {!isNaN(n) && n > 0 ? "+" : ""}{val ?? "—"}
    </span>
  );
}

const PERIODS = ["1W", "1M", "3M", "YTD", "1Y", "3Y", "5Y"] as const;

export default function PerformanceTable({ data }: Props) {
  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b" style={{ borderColor: "rgba(43,92,224,0.12)" }}>
        <h2 className="text-sm font-semibold text-white">Retornos &amp; Múltiplos</h2>
        <p className="text-xs mt-0.5" style={{ color: "#475569" }}>Rendimiento por período y valuación comparada</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs whitespace-nowrap">
          <thead>
            <tr style={{ background: "rgba(13,24,82,0.8)" }}>
              <th className="px-4 py-2.5 text-left font-medium sticky left-0 z-10"
                style={{ color: "#475569", background: "rgba(13,24,82,0.95)" }}
              >
                Índice
              </th>
              <th className="px-4 py-2.5 text-right font-medium" style={{ color: "#475569" }}>
                Precio
              </th>
              {PERIODS.map(p => (
                <th key={p} className="px-3 py-2.5 text-right font-medium" style={{ color: "#475569" }}>
                  {p}
                </th>
              ))}
              <th className="px-4 py-2.5 text-right font-medium" style={{ color: "#475569" }}>EV/EBITDA</th>
              <th className="px-4 py-2.5 text-right font-medium" style={{ color: "#475569" }}>P/U</th>
              <th className="px-4 py-2.5 text-right font-medium" style={{ color: "#475569" }}>ROE</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr
                key={i}
                className="border-t transition-colors"
                style={{ borderColor: "rgba(43,92,224,0.07)" }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(43,92,224,0.04)"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
              >
                <td className="px-4 py-2.5 sticky left-0 z-10"
                  style={{ background: "rgba(9,16,58,0.98)", color: "#EEF2FF", fontWeight: 500 }}
                >
                  {row.Index_Name}
                </td>
                <td className="px-4 py-2.5 text-right font-mono" style={{ color: "#94A3B8" }}>
                  {typeof row["Price (USD)"] === "number"
                    ? row["Price (USD)"] > 1000
                      ? row["Price (USD)"].toLocaleString("en-US", { maximumFractionDigits: 0 })
                      : row["Price (USD)"].toFixed(2)
                    : "—"}
                </td>
                {PERIODS.map(p => (
                  <td key={p} className="px-3 py-2.5 text-right">{pctCell(row[p])}</td>
                ))}
                <td className="px-4 py-2.5 text-right font-mono" style={{ color: "#94A3B8" }}>
                  {row["EV/EBITDA NTM"] != null ? `${row["EV/EBITDA NTM"]}x` : "—"}
                </td>
                <td className="px-4 py-2.5 text-right font-mono" style={{ color: "#94A3B8" }}>
                  {row["P/U NTM"] != null ? `${row["P/U NTM"]}x` : "—"}
                </td>
                <td className="px-4 py-2.5 text-right">
                  {row.ROE ? pctCell(row.ROE) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
