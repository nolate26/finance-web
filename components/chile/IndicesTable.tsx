"use client";

type IndexRow = Record<string, unknown>;

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtPct(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "number" ? v : parseFloat(String(v));
  if (isNaN(n)) return "—";
  return `${n >= 0 ? "+" : ""}${(n * 100).toFixed(1)}%`;
}

function fmtMult(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "number" ? v : parseFloat(String(v));
  if (isNaN(n)) return "—";
  return `${n.toFixed(1)}x`;
}

function fmt(v: unknown, type: "pct" | "mult"): string {
  return type === "pct" ? fmtPct(v) : fmtMult(v);
}

function pctColor(v: unknown): string {
  if (v === null || v === undefined) return "#64748B";
  const n = typeof v === "number" ? v : parseFloat(String(v));
  if (isNaN(n)) return "#64748B";
  if (n > 0.02) return "#059669";
  if (n < -0.02) return "#DC2626";
  return "#64748B";
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function IndicesTable({ indices }: { indices: IndexRow[] }) {
  if (!indices || indices.length === 0) return null;

  // Dynamic year labels — no hardcoded years
  const yr1e = new Date().getFullYear();
  const yr2e = yr1e + 1;

  const COLUMN_GROUPS = [
    {
      label: "EBITDA Growth",
      color: "#059669",
      cols: [
        { key: "ebitda_ltm",  header: "LTM",          fmt: "pct" as const },
        { key: "ebitda_yr1e", header: `${yr1e}E`,     fmt: "pct" as const },
        { key: "ebitda_yr2e", header: `${yr2e}E`,     fmt: "pct" as const },
      ],
    },
    {
      label: "FV/EBITDA",
      color: "#2B5CE0",
      cols: [
        { key: "fv_ebitda_ltm",  header: "LTM",      fmt: "mult" as const },
        { key: "fv_ebitda_yr1e", header: `${yr1e}E`, fmt: "mult" as const },
        { key: "fv_ebitda_yr2e", header: `${yr2e}E`, fmt: "mult" as const },
      ],
    },
    {
      label: "NI",
      color: "#059669",
      cols: [
        { key: "ni_ltm",  header: "LTM",          fmt: "pct" as const },
        { key: "ni_yr1e", header: `${yr1e}E`,     fmt: "pct" as const },
        { key: "ni_yr2e", header: `${yr2e}E`,     fmt: "pct" as const },
      ],
    },
    {
      label: "P/E",
      color: "#7C3AED",
      cols: [
        { key: "pe_ltm",  header: "LTM",          fmt: "mult" as const },
        { key: "pe_yr1e", header: `${yr1e}E`,     fmt: "mult" as const },
        { key: "pe_yr2e", header: `${yr2e}E`,     fmt: "mult" as const },
      ],
    },
    {
      label: "Other Multiples",
      color: "#475569",
      cols: [
        { key: "p_bv_ltm", header: "P/BV",     fmt: "mult" as const },
        { key: "fv_s_ltm", header: "FV/S LTM", fmt: "mult" as const },
      ],
    },
    {
      label: "Returns & Quality",
      color: "#D97706",
      cols: [
        { key: "div_yield", header: "Div Yield",    fmt: "pct"  as const },
        { key: "roic_ltm",  header: "ROIC",         fmt: "pct"  as const },
        { key: "fv_ic",     header: "FV/IC",        fmt: "mult" as const },
        { key: "roe_yr1e",  header: `ROE ${yr1e}E`, fmt: "pct"  as const },
      ],
    },
  ];

  const totalCols = COLUMN_GROUPS.reduce((s, g) => s + g.cols.length, 0);

  return (
    <div className="card overflow-hidden mb-4" style={{ padding: 0 }}>
      {/* Card header */}
      <div
        style={{
          padding: "10px 16px",
          borderBottom: "1px solid rgba(15,23,42,0.07)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 600, color: "#64748B", letterSpacing: "0.08em" }}>
          BENCHMARK INDICES
        </span>
        <span style={{ fontSize: 10, color: "#94A3B8" }}>
          Crecimiento YoY · Múltiplos consolidados
        </span>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
          <thead>
            {/* Row 1 — group labels */}
            <tr style={{ background: "#F0F4FA" }}>
              <th
                rowSpan={2}
                style={{
                  padding: "8px 14px",
                  textAlign: "left",
                  fontSize: 10,
                  fontWeight: 600,
                  color: "#475569",
                  letterSpacing: "0.06em",
                  borderRight: "2px solid rgba(15,23,42,0.08)",
                  verticalAlign: "middle",
                  minWidth: 120,
                }}
              >
                INDEX
              </th>
              {COLUMN_GROUPS.map((g) => (
                <th
                  key={g.label}
                  colSpan={g.cols.length}
                  style={{
                    padding: "6px 8px",
                    textAlign: "center",
                    fontSize: 9,
                    fontWeight: 700,
                    color: g.color,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    borderLeft: "1px solid rgba(15,23,42,0.06)",
                    borderBottom: "1px solid rgba(15,23,42,0.08)",
                  }}
                >
                  {g.label}
                </th>
              ))}
            </tr>
            {/* Row 2 — column sub-labels */}
            <tr style={{ background: "#F8FAFC" }}>
              {COLUMN_GROUPS.map((g) =>
                g.cols.map((col, ci) => (
                  <th
                    key={col.key}
                    style={{
                      padding: "5px 8px",
                      textAlign: "center",
                      fontSize: 9,
                      fontWeight: 600,
                      color: "#64748B",
                      letterSpacing: "0.06em",
                      borderLeft: ci === 0 ? "1px solid rgba(15,23,42,0.06)" : undefined,
                      borderBottom: "1px solid rgba(15,23,42,0.10)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {col.header}
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody>
            {indices.map((row, i) => {
              const name = String(row.company ?? "");
              return (
                <tr
                  key={name || i}
                  style={{
                    background: i % 2 === 0 ? "transparent" : "rgba(15,23,42,0.02)",
                    borderBottom: "1px solid rgba(15,23,42,0.05)",
                  }}
                >
                  <td
                    style={{
                      padding: "8px 14px",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#0F172A",
                      borderRight: "2px solid rgba(15,23,42,0.08)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {name}
                  </td>
                  {COLUMN_GROUPS.map((g) =>
                    g.cols.map((col, ci) => {
                      const v = row[col.key];
                      const cellColor =
                        col.fmt === "pct" ? pctColor(v) : "#334155";
                      return (
                        <td
                          key={col.key}
                          style={{
                            padding: "8px 8px",
                            textAlign: "center",
                            fontFamily: "monospace",
                            fontSize: 11,
                            fontWeight: col.fmt === "mult" ? 500 : 600,
                            color: cellColor,
                            borderLeft: ci === 0 ? "1px solid rgba(15,23,42,0.06)" : undefined,
                          }}
                        >
                          {fmt(v, col.fmt)}
                        </td>
                      );
                    })
                  )}
                </tr>
              );
            })}
            {/* Spacer at the bottom */}
            <tr style={{ height: 0, borderTop: `1px solid rgba(15,23,42,0.08)` }}>
              <td colSpan={1 + totalCols} style={{ padding: 0 }} />
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex justify-end px-4 py-2">
        <span className="text-xs" style={{ color: "#CBD5E1" }}>Fuente: Bloomberg</span>
      </div>
    </div>
  );
}
