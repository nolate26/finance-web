"use client";

interface ReturnRow {
  clase: string;
  ytd: number | null;
  oneYear: number | null;
  threeYears: number | null;
  fiveYears: number | null;
  tenYears: number | null;
  sinceInception: number | null;
  moic: number | null;
  alpha: number | null;
  stdDev3Y: number | null;
}

interface Props {
  returns: ReturnRow[];
  fundName: string;
  reportDate?: string | null;
}

function fmtPct(v: number | null): string {
  if (v === null) return "—";
  return (v > 0 ? "+" : "") + (v * 100).toFixed(2) + "%";
}

function fmtMoic(v: number | null): string {
  if (v === null) return "—";
  return v.toFixed(2) + "x";
}

// Determines if a row is the OP/UP outperformance row
function isOpRow(clase: string): boolean {
  return clase.toLowerCase().startsWith("op/up") || clase.toLowerCase().startsWith("outperform");
}

// Signed color for a numeric value
function signColor(v: number | null, forceSign = false): string {
  if (v === null) return "#64748B";
  if (forceSign || v !== 0) {
    if (v > 0) return "#059669";
    if (v < 0) return "#DC2626";
  }
  return "#64748B";
}

const COLS: { key: keyof ReturnRow; label: string; fmt: (v: number | null) => string; signedColor?: boolean }[] = [
  { key: "ytd",           label: "YTD",            fmt: fmtPct },
  { key: "oneYear",       label: "1 Year",          fmt: fmtPct },
  { key: "threeYears",    label: "3 Years",         fmt: fmtPct },
  { key: "fiveYears",     label: "5 Years",         fmt: fmtPct },
  { key: "tenYears",      label: "10 Years",        fmt: fmtPct },
  { key: "sinceInception",label: "Since Inception", fmt: fmtPct },
  { key: "moic",          label: "MOIC",            fmt: fmtMoic },
  { key: "alpha",         label: "Alpha",           fmt: fmtPct, signedColor: true },
  { key: "stdDev3Y",      label: "σ 3Y",            fmt: fmtPct },
];

export default function FundReturnsTable({ returns, fundName, reportDate }: Props) {
  if (!returns || returns.length === 0) return null;

  return (
    <div className="card mb-5" style={{ overflow: "hidden", padding: 0 }}>
      <div
        style={{
          padding: "10px 18px",
          borderBottom: "1px solid rgba(15,23,42,0.07)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 600, color: "#64748B", letterSpacing: "0.08em" }}>
          HISTORICAL RETURNS — {fundName.toUpperCase()}
        </span>
        {reportDate && (
          <span style={{ fontSize: 10, color: "#CBD5E1" }}>Data as of: {reportDate}</span>
        )}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#F0F4FA" }}>
              <th style={{ padding: "8px 18px", textAlign: "left", fontSize: 9, fontWeight: 600, color: "#64748B", letterSpacing: "0.08em", minWidth: 180 }}>
                CLASS
              </th>
              {COLS.map((c) => (
                <th
                  key={c.key}
                  style={{ padding: "8px 14px", textAlign: "right", fontSize: 9, fontWeight: 600, color: "#64748B", letterSpacing: "0.08em", minWidth: 80 }}
                >
                  {c.label.toUpperCase()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {returns.map((row, i) => {
              const isOp = isOpRow(row.clase);
              const rowBg = isOp
                ? "rgba(5,150,105,0.04)"
                : i % 2 === 0 ? "transparent" : "rgba(15,23,42,0.02)";
              const separatorStyle = isOp
                ? { borderTop: "1px solid rgba(15,23,42,0.08)" }
                : {};

              return (
                <tr
                  key={row.clase}
                  style={{
                    background: rowBg,
                    borderBottom: "1px solid rgba(15,23,42,0.05)",
                    ...separatorStyle,
                  }}
                >
                  <td style={{ padding: "10px 18px" }}>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: isOp ? 700 : 600,
                        color: isOp ? "#059669" : "#334155",
                        fontStyle: isOp ? "italic" : "normal",
                      }}
                    >
                      {row.clase}
                    </span>
                  </td>
                  {COLS.map((col) => {
                    const val = row[col.key] as number | null;
                    const useSign = col.signedColor || isOp;
                    const color = useSign ? signColor(val) : "#0F172A";
                    return (
                      <td
                        key={col.key}
                        style={{
                          padding: "10px 14px",
                          textAlign: "right",
                          fontFamily: "monospace",
                          fontSize: 12,
                          fontWeight: isOp ? 700 : 500,
                          color: val === null ? "#CBD5E1" : color,
                        }}
                      >
                        {col.fmt(val)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
