"use client";

interface MetricBlock {
  y2025: number;
  y2026: number;
  y2027: number;
}

export interface ProjectionRow {
  empresa: string;
  moneda: string;
  sector: string;
  ingresos: MetricBlock | null;
  ebitda: MetricBlock | null;
  ebit: MetricBlock | null;
  utilidad: MetricBlock | null;
}

interface Props {
  rows: ProjectionRow[];
}

/** Compact number formatter — e.g. 1_234_567 → "1.2M", 626578 → "626.6K" */
function fmtVal(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1_000_000) return sign + (abs / 1_000_000).toFixed(1) + "M";
  if (abs >= 1_000)     return sign + (abs / 1_000).toFixed(1) + "K";
  return v.toFixed(0);
}

function MetricCell({ block, year }: { block: MetricBlock | null; year: keyof MetricBlock }) {
  if (block === null) {
    return (
      <td className="px-3 py-2.5 text-center font-mono text-xs" style={{ color: "#CBD5E1" }}>
        —
      </td>
    );
  }
  const v = block[year];
  const color = v < 0 ? "#DC2626" : "#0F172A";
  return (
    <td className="px-3 py-2.5 text-right font-mono text-xs" style={{ color }}>
      {fmtVal(v)}
    </td>
  );
}


// Company Info columns: Empresa, Sector, Moneda = 3 cols
const METRIC_HEADERS = ["Ingresos", "EBITDA", "EBIT", "Utilidad"] as const;
const YEARS = ["'25", "'26", "'27"] as const;
const YEAR_KEYS: (keyof MetricBlock)[] = ["y2025", "y2026", "y2027"];

// 3 Company Info cols + 4 metrics × 3 years = 15 total
const BORDER_METRIC = "1px solid rgba(43,92,224,0.12)";
const BORDER_LIGHT  = "1px solid rgba(15,23,42,0.05)";

export default function ProjectionsTable({ rows }: Props) {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs whitespace-nowrap" style={{ borderCollapse: "collapse" }}>
          <thead>
            {/* Row 1 — group headers */}
            <tr style={{ background: "#EEF2FA" }}>
              <th
                colSpan={3}
                className="px-4 py-2 text-left text-[10px] font-bold tracking-widest uppercase"
                style={{ color: "#64748B", borderBottom: BORDER_METRIC, borderRight: BORDER_METRIC }}
              >
                Company Info
              </th>
              {METRIC_HEADERS.map((m) => (
                <th
                  key={m}
                  colSpan={3}
                  className="px-4 py-2 text-center text-[10px] font-bold tracking-widest uppercase"
                  style={{ color: "#2B5CE0", borderBottom: BORDER_METRIC, borderRight: BORDER_METRIC }}
                >
                  {m}
                </th>
              ))}
            </tr>
            {/* Row 2 — column headers */}
            <tr style={{ background: "#F0F4FA" }}>
              <th className="px-4 py-2 text-left font-medium" style={{ color: "#64748B", borderBottom: BORDER_LIGHT }}>Empresa</th>
              <th className="px-3 py-2 text-left font-medium" style={{ color: "#64748B", borderBottom: BORDER_LIGHT }}>Sector</th>
              <th className="px-3 py-2 text-left font-medium" style={{ color: "#64748B", borderBottom: BORDER_LIGHT, borderRight: BORDER_METRIC }}>Mon.</th>
              {METRIC_HEADERS.map((m) =>
                YEARS.map((y, yi) => (
                  <th
                    key={`${m}-${y}`}
                    className="px-3 py-2 text-right font-medium"
                    style={{
                      color: "#64748B",
                      borderBottom: BORDER_LIGHT,
                      borderRight: yi === 2 ? BORDER_METRIC : undefined,
                    }}
                  >
                    {y}
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={i}
                className="transition-colors"
                style={{ borderBottom: BORDER_LIGHT }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(43,92,224,0.03)"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}
              >
                <td className="px-4 py-2.5 font-medium" style={{ color: "#0F172A" }}>{row.empresa}</td>
                <td className="px-3 py-2.5" style={{ color: "#64748B" }}>{row.sector || "—"}</td>
                <td className="px-3 py-2.5 font-mono" style={{ color: "#94A3B8", borderRight: BORDER_METRIC }}>{row.moneda}</td>

                {/* Ingresos */}
                {YEAR_KEYS.map((k, ki) => (
                  <td key={`ing-${k}`} className={ki === 2 ? "" : ""} style={{ borderRight: ki === 2 ? BORDER_METRIC : undefined }}>
                    <MetricCell block={row.ingresos} year={k} />
                  </td>
                ))}

                {/* EBITDA */}
                {YEAR_KEYS.map((k, ki) => (
                  <td key={`ebd-${k}`} style={{ borderRight: ki === 2 ? BORDER_METRIC : undefined }}>
                    <MetricCell block={row.ebitda} year={k} />
                  </td>
                ))}

                {/* EBIT */}
                {YEAR_KEYS.map((k, ki) => (
                  <td key={`ebt-${k}`} style={{ borderRight: ki === 2 ? BORDER_METRIC : undefined }}>
                    <MetricCell block={row.ebit} year={k} />
                  </td>
                ))}

                {/* Utilidad */}
                {YEAR_KEYS.map((k) => (
                  <td key={`utl-${k}`}>
                    <MetricCell block={row.utilidad} year={k} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
