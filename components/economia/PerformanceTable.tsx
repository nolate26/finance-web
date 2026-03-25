"use client";

import { useState } from "react";

interface TablaRow {
  Ticker: string;
  Index_Name: string;
  "Price (Local)": number;
  "1W": string;
  "1M": string;
  "3M": string;
  YTD: string;
  "1Y": string;
  "3Y": string;
  "5Y": string;
  "10Y": string;
  "EV/EBITDA (Fwd 12m)": number | null;
  "P/U (Fwd 12m)": number | null;
  "ROE (Trailing)": string;
}

interface Props {
  data: TablaRow[];
}

const INDEX_GROUPS = [
  { label: "MUNDO",  indices: ["MSCI World ACWI"] },
  { label: "LATAM",  indices: ["MSCI EM LatAm", "MSCI EM Small Cap", "IPSA (Chile)", "Bovespa (Brasil)", "Mexbol (Mexico)", "Merval (Argentina)", "Colcap (Colombia)", "BVL (Peru)", "SMLLBV (Brasil)"] },
  { label: "EEUU",   indices: ["Dow Jones (US)", "S&P 500 (US)", "Nasdaq 100 (US)", "Russell 2000 (US)"] },
  { label: "EUROPA", indices: ["Stoxx Europe 600", "FTSE 100 (UK)", "DAX (Alemania)", "CAC 40 (Francia)", "Swiss Market (Suiza)"] },
  { label: "ASIA",   indices: ["Nikkei 225 (Japon)", "Topix Index (Japon)", "Hang Seng (Hong Kong)", "Hang Seng Tech (Hong Kong)", "CSI 300 (China)", "Kospi Index (Corea)", "S&P/ASX 200 (Australia)", "Nifty 50 (India)"] },
];

const ALL_GROUPED = new Set(INDEX_GROUPS.flatMap((g) => g.indices));
const PERIODS = ["1W", "1M", "3M", "YTD", "1Y", "3Y", "5Y", "10Y"] as const;
type Period = (typeof PERIODS)[number];
type SortKey = "Price (Local)" | Period | "EV/EBITDA (Fwd 12m)" | "P/U (Fwd 12m)" | "ROE (Trailing)";
interface SortConfig { key: SortKey; dir: "asc" | "desc" }

// Column span: Index + Price + periods + EV/EBITDA + P/U + ROE
const COL_SPAN = 2 + PERIODS.length + 3;

function pctColor(val: string) {
  const n = parseFloat(val);
  if (isNaN(n)) return "#64748B";
  if (n > 0) return "#059669";
  if (n < 0) return "#DC2626";
  return "#64748B";
}

function pctCell(val: string) {
  const color = pctColor(val);
  const n = parseFloat(val);
  return (
    <span
      className="font-mono text-[11px] font-semibold px-1.5 py-0.5 rounded"
      style={{ color, background: `${color}12` }}
    >
      {!isNaN(n) && n > 0 ? "+" : ""}
      {val ?? "—"}
    </span>
  );
}

function rawPctCell(val: string) {
  const n = parseFloat(val);
  if (isNaN(n)) return <span style={{ color: "#64748B" }}>—</span>;
  const color = n > 0 ? "#059669" : n < 0 ? "#DC2626" : "#64748B";
  const display = (n >= 0 ? "+" : "") + n.toFixed(1) + "%";
  return (
    <span
      className="font-mono text-[11px] font-semibold px-1.5 py-0.5 rounded"
      style={{ color, background: `${color}12` }}
    >
      {display}
    </span>
  );
}

function numVal(row: TablaRow, key: SortKey): number {
  if (key === "Price (Local)") return row["Price (Local)"] ?? -Infinity;
  if (key === "EV/EBITDA (Fwd 12m)") return row["EV/EBITDA (Fwd 12m)"] ?? -Infinity;
  if (key === "P/U (Fwd 12m)") return row["P/U (Fwd 12m)"] ?? -Infinity;
  if (key === "ROE (Trailing)") return parseFloat(row["ROE (Trailing)"]) ?? -Infinity;
  // Period strings like "-2.7%"
  const v = parseFloat(row[key as Period]);
  return isNaN(v) ? -Infinity : v;
}

function sortRows(rows: TablaRow[], cfg: SortConfig | null): TablaRow[] {
  if (!cfg) return rows;
  return [...rows].sort((a, b) => {
    const av = numVal(a, cfg.key);
    const bv = numVal(b, cfg.key);
    if (av === -Infinity && bv === -Infinity) return 0;
    if (av === -Infinity) return 1;
    if (bv === -Infinity) return -1;
    return cfg.dir === "asc" ? av - bv : bv - av;
  });
}

function SortBtn({
  label, sortKey, cfg, onSort,
}: {
  label: string;
  sortKey: SortKey;
  cfg: SortConfig | null;
  onSort: (k: SortKey) => void;
}) {
  const active = cfg?.key === sortKey;
  const indicator = active ? (cfg!.dir === "asc" ? " ▲" : " ▼") : " ↕";
  return (
    <button
      onClick={() => onSort(sortKey)}
      className="flex items-center justify-center gap-0.5 w-full font-medium text-[11px] tracking-wide"
      style={{ color: active ? "#1E3A8A" : "#64748B", background: "none", border: "none", cursor: "pointer", padding: 0 }}
    >
      {label}
      <span style={{ fontSize: 9, opacity: active ? 1 : 0.5 }}>{indicator}</span>
    </button>
  );
}

function GroupHeader({ label }: { label: string }) {
  return (
    <tr>
      <td
        colSpan={COL_SPAN}
        className="px-4 py-1.5 text-[10px] font-bold tracking-widest uppercase sticky left-0"
        style={{ background: "#EEF2FA", color: "#64748B", borderBottom: "1px solid rgba(15,23,42,0.07)" }}
      >
        {label}
      </td>
    </tr>
  );
}

function DataRow({ row, isLast }: { row: TablaRow; isLast: boolean }) {
  return (
    <tr
      className="transition-colors"
      style={{
        borderBottom: isLast
          ? "2px solid rgba(15,23,42,0.10)"
          : "1px solid rgba(15,23,42,0.05)",
      }}
      onMouseEnter={(e) =>
        ((e.currentTarget as HTMLElement).style.background = "rgba(43,92,224,0.03)")
      }
      onMouseLeave={(e) =>
        ((e.currentTarget as HTMLElement).style.background = "transparent")
      }
    >
      <td
        className="px-4 py-2.5 sticky left-0 z-10"
        style={{ background: "#FFFFFF", color: "#0F172A", fontWeight: 500 }}
      >
        {row.Index_Name}
      </td>
      <td className="px-4 py-2.5 text-center font-mono" style={{ color: "#475569" }}>
        {typeof row["Price (Local)"] === "number"
          ? row["Price (Local)"] > 1000
            ? row["Price (Local)"].toLocaleString("en-US", { maximumFractionDigits: 0 })
            : row["Price (Local)"].toFixed(2)
          : "—"}
      </td>
      {PERIODS.map((p) => (
        <td key={p} className="px-3 py-2.5 text-center">
          {pctCell(row[p])}
        </td>
      ))}
      <td className="px-4 py-2.5 text-center font-mono" style={{ color: "#475569" }}>
        {row["EV/EBITDA (Fwd 12m)"] != null ? `${row["EV/EBITDA (Fwd 12m)"]}x` : "—"}
      </td>
      <td className="px-4 py-2.5 text-center font-mono" style={{ color: "#475569" }}>
        {row["P/U (Fwd 12m)"] != null ? `${row["P/U (Fwd 12m)"]}x` : "—"}
      </td>
      <td className="px-4 py-2.5 text-center">
        {row["ROE (Trailing)"] ? rawPctCell(row["ROE (Trailing)"]) : "—"}
      </td>
    </tr>
  );
}

export default function PerformanceTable({ data }: Props) {
  const [sortCfg, setSortCfg] = useState<SortConfig | null>(null);

  function handleSort(key: SortKey) {
    setSortCfg((prev) =>
      prev?.key === key
        ? { key, dir: prev.dir === "desc" ? "asc" : "desc" }
        : { key, dir: "desc" }
    );
  }

  const dataMap = new Map(data.map((r) => [r.Index_Name, r]));
  const ungrouped = data.filter((r) => !ALL_GROUPED.has(r.Index_Name));

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b" style={{ borderColor: "rgba(15,23,42,0.07)" }}>
        <h2 className="text-sm font-semibold" style={{ color: "#0F172A" }}>Retornos &amp; Múltiplos</h2>
        <p className="text-xs mt-0.5" style={{ color: "#64748B" }}>
          Rendimiento por período y valuación comparada (en moneda local)
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs whitespace-nowrap">
          <thead>
            <tr style={{ background: "#F0F4FA" }}>
              <th
                className="px-4 py-2.5 text-left font-medium sticky left-0 z-10"
                style={{ color: "#64748B", background: "#F0F4FA" }}
              >
                Índice
              </th>
              <th className="px-4 py-2.5 text-center">
                <SortBtn label="Price" sortKey="Price (Local)" cfg={sortCfg} onSort={handleSort} />
              </th>
              {PERIODS.map((p) => (
                <th key={p} className="px-3 py-2.5 text-center">
                  <SortBtn label={p} sortKey={p} cfg={sortCfg} onSort={handleSort} />
                </th>
              ))}
              <th className="px-4 py-2.5 text-center">
                <SortBtn label="EV/EBITDA" sortKey="EV/EBITDA (Fwd 12m)" cfg={sortCfg} onSort={handleSort} />
              </th>
              <th className="px-4 py-2.5 text-center">
                <SortBtn label="P/U" sortKey="P/U (Fwd 12m)" cfg={sortCfg} onSort={handleSort} />
              </th>
              <th className="px-4 py-2.5 text-center">
                <SortBtn label="ROE" sortKey="ROE (Trailing)" cfg={sortCfg} onSort={handleSort} />
              </th>
            </tr>
          </thead>
          <tbody>
            {INDEX_GROUPS.map((group) => {
              const rows = sortRows(
                group.indices.map((name) => dataMap.get(name)).filter((r): r is TablaRow => r !== undefined),
                sortCfg,
              );
              if (rows.length === 0) return null;
              return (
                <>
                  <GroupHeader key={`hdr-${group.label}`} label={group.label} />
                  {rows.map((row, i) => (
                    <DataRow key={row.Index_Name} row={row} isLast={i === rows.length - 1} />
                  ))}
                </>
              );
            })}
            {ungrouped.length > 0 && (
              <>
                <GroupHeader key="hdr-ungrouped" label="OTROS" />
                {sortRows(ungrouped, sortCfg).map((row, i) => (
                  <DataRow key={row.Index_Name} row={row} isLast={i === ungrouped.length - 1} />
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
