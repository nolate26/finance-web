"use client";

import { useState } from "react";

interface ResumenRow {
  Index: string;
  "Today (P/E)": number | null;
  median: number | null;
  max: number | null;
  min: number | null;
  stdDev: number | null;
  discount: number | null;
}

interface Props {
  data: ResumenRow[];
  onSelectIndex: (idx: string) => void;
  selectedIndices: string[];
}

const INDEX_GROUPS = [
  { label: "MUNDO",  indices: ["MSCI World ACWI"] },
  { label: "LATAM",  indices: ["MSCI EM LatAm", "MSCI EM Small Cap", "IPSA (Chile)", "Bovespa (Brasil)", "Mexbol (Mexico)", "Merval (Argentina)", "Colcap (Colombia)", "BVL (Peru)", "SMLLBV (Brasil)"] },
  { label: "EEUU",   indices: ["Dow Jones (US)", "S&P 500 (US)", "Nasdaq 100 (US)", "Russell 2000 (US)"] },
  { label: "EUROPA", indices: ["Stoxx Europe 600", "FTSE 100 (UK)", "DAX (Alemania)", "CAC 40 (Francia)", "Swiss Market (Suiza)"] },
  { label: "ASIA",   indices: ["Nikkei 225 (Japon)", "Topix Index (Japon)", "Hang Seng (Hong Kong)", "Hang Seng Tech (Hong Kong)", "CSI 300 (China)", "Kospi Index (Corea)", "S&P/ASX 200 (Australia)", "Nifty 50 (India)"] },
];

const ALL_GROUPED = new Set(INDEX_GROUPS.flatMap((g) => g.indices));
const SLOT_COLORS = ["#2B5CE0", "#D97706", "#059669"];

type SortKey = "Today (P/E)" | "median" | "discount";
interface SortConfig { key: SortKey; dir: "asc" | "desc" }

function discountColor(d: number | null): string {
  if (d == null) return "#64748B";
  if (d > 10) return "#059669";
  if (d < -10) return "#DC2626";
  return "#D97706";
}

function peBar(
  today: number | null,
  median: number | null,
  min: number | null,
  max: number | null,
  stdDev: number | null,
) {
  if (median == null) return { todayPct: null, medianPct: 50, sigmaLeftPct: null, sigmaWidthPct: null, lo: null, hi: null };

  // Outer bar range: ±2σ when available, fallback to min/max
  let lo: number, hi: number;
  if (stdDev != null && stdDev > 0) {
    lo = median - 2 * stdDev;
    hi = median + 2 * stdDev;
  } else if (min != null && max != null && max > min) {
    lo = min;
    hi = max;
  } else {
    return { todayPct: null, medianPct: 50, sigmaLeftPct: null, sigmaWidthPct: null, lo: null, hi: null };
  }

  const range = hi - lo;
  const medianPct = Math.max(0, Math.min(100, ((median - lo) / range) * 100));
  const todayPct  = today != null ? Math.max(0, Math.min(100, ((today - lo) / range) * 100)) : null;

  // ±1σ band is always 25%–75% inside a ±2σ outer range
  const sigmaLeftPct  = stdDev != null ? 25 : null;
  const sigmaWidthPct = stdDev != null ? 50 : null;

  return { todayPct, medianPct, sigmaLeftPct, sigmaWidthPct, lo, hi };
}

function sortRows(rows: ResumenRow[], cfg: SortConfig | null): ResumenRow[] {
  if (!cfg) return rows;
  return [...rows].sort((a, b) => {
    const av = a[cfg.key] ?? null;
    const bv = b[cfg.key] ?? null;
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    return cfg.dir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
  });
}

function SortBtn({
  label, sortKey, cfg, onSort, center,
}: {
  label: string;
  sortKey: SortKey;
  cfg: SortConfig | null;
  onSort: (k: SortKey) => void;
  center?: boolean;
}) {
  const active = cfg?.key === sortKey;
  const indicator = active ? (cfg!.dir === "asc" ? " ▲" : " ▼") : " ↕";
  return (
    <button
      onClick={() => onSort(sortKey)}
      className={`flex items-center gap-0.5 w-full font-medium text-[11px] tracking-wide ${center ? "justify-center" : "justify-end"}`}
      style={{ color: active ? "#1E3A8A" : "#64748B", background: "none", border: "none", cursor: "pointer", padding: 0 }}
    >
      {label}
      <span style={{ fontSize: 9, opacity: active ? 1 : 0.5 }}>{indicator}</span>
    </button>
  );
}

function IndexRow({ row, slot, slotColor, isLast, onSelectIndex }: {
  row: ResumenRow;
  slot: number;
  slotColor: string | null;
  isLast: boolean;
  onSelectIndex: (idx: string) => void;
}) {
  const isActive = slot !== -1;
  const discColor = discountColor(row.discount);
  const { todayPct, medianPct, sigmaLeftPct, sigmaWidthPct, lo, hi } = peBar(row["Today (P/E)"], row.median, row.min, row.max, row.stdDev);

  return (
    <tr
      onClick={() => onSelectIndex(row.Index)}
      className="cursor-pointer transition-all duration-150"
      style={{
        borderBottom: isLast
          ? "2px solid rgba(15,23,42,0.10)"
          : "1px solid rgba(15,23,42,0.05)",
        background: isActive ? `${slotColor}10` : "transparent",
      }}
      onMouseEnter={(e) => {
        if (!isActive) (e.currentTarget as HTMLElement).style.background = "rgba(43,92,224,0.03)";
      }}
      onMouseLeave={(e) => {
        if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent";
      }}
    >
      {/* Index name */}
      <td className="px-4 py-2.5 font-medium" style={{ color: isActive ? slotColor! : "#334155" }}>
        <div className="flex items-center gap-2">
          {isActive && (
            <span
              className="text-[9px] font-bold font-mono rounded px-1 py-0.5 leading-none"
              style={{ background: `${slotColor}20`, color: slotColor!, border: `1px solid ${slotColor}40` }}
            >
              G{slot + 1}
            </span>
          )}
          {row.Index}
        </div>
      </td>

      {/* P/E Hoy */}
      <td className="px-4 py-2.5 text-center font-mono font-semibold" style={{ color: "#0F172A" }}>
        {row["Today (P/E)"] != null ? `${row["Today (P/E)"]!.toFixed(1)}x` : "—"}
      </td>

      {/* Mediana 10Y */}
      <td className="px-4 py-2.5 text-center font-mono" style={{ color: "#475569" }}>
        {row.median != null ? `${row.median.toFixed(1)}x` : "—"}
      </td>

      {/* Descuento */}
      <td className="px-4 py-2.5 text-center">
        {row.discount != null ? (
          <span
            className="font-mono font-semibold text-[11px] px-2 py-0.5 rounded-full"
            style={{ color: discColor, background: `${discColor}14`, border: `1px solid ${discColor}30` }}
          >
            {row.discount > 0 ? "+" : ""}{row.discount.toFixed(1)}%
          </span>
        ) : (
          <span style={{ color: "#CBD5E1" }}>—</span>
        )}
      </td>

      {/* Range ±1σ bar */}
      <td className="px-4 py-2.5 w-44">
        <div
          className="relative h-4 rounded-sm overflow-hidden"
          style={{ background: "rgba(15,23,42,0.06)" }}
        >
          {/* ±1σ band */}
          {sigmaLeftPct != null && sigmaWidthPct != null && (
            <div
              className="absolute top-0 bottom-0 rounded-sm"
              style={{
                left: `${sigmaLeftPct}%`,
                width: `${sigmaWidthPct}%`,
                background: "rgba(100,116,139,0.22)",
              }}
            />
          )}
          {/* Median tick */}
          <div
            className="absolute top-0 bottom-0 w-px"
            style={{ left: `${medianPct}%`, background: "rgba(100,116,139,0.55)" }}
          />
          {/* Today dot */}
          {todayPct != null && (
            <div
              className="absolute top-1 bottom-1 w-1.5 rounded-sm"
              style={{ left: `${todayPct}%`, background: discColor }}
            />
          )}
        </div>
        <div className="flex justify-between mt-0.5 text-[10px]" style={{ color: "#94A3B8" }}>
          <span>{lo != null ? lo.toFixed(1) : ""}</span>
          <span>{hi != null ? hi.toFixed(1) : ""}</span>
        </div>
      </td>
    </tr>
  );
}

export default function ValuationTable({ data, onSelectIndex, selectedIndices }: Props) {
  const [sortCfg, setSortCfg] = useState<SortConfig | null>(null);

  function handleSort(key: SortKey) {
    setSortCfg((prev) =>
      prev?.key === key
        ? { key, dir: prev.dir === "desc" ? "asc" : "desc" }
        : { key, dir: "desc" }
    );
  }

  const dataMap = new Map(data.map((r) => [r.Index, r]));
  const ungrouped = data.filter((r) => !ALL_GROUPED.has(r.Index));

  return (
    <div className="card overflow-hidden">
      <div
        className="px-5 py-4 border-b flex items-center justify-between"
        style={{ borderColor: "rgba(15,23,42,0.07)" }}
      >
        <div>
          <h2 className="text-sm font-semibold" style={{ color: "#0F172A" }}>Valuación P/E</h2>
          <p className="text-xs mt-0.5" style={{ color: "#64748B" }}>
            Precio/Utilidad actual vs histórico (en moneda local) — click para graficar
          </p>
        </div>
      </div>

      <div className="overflow-auto">
        <table className="w-full text-xs">
          <thead>
            <tr style={{ background: "#F0F4FA" }}>
              <th className="px-4 py-2.5 text-left font-medium tracking-wide" style={{ color: "#64748B" }}>
                Índice
              </th>
              <th className="px-4 py-2.5 text-center">
                <SortBtn label="P/E Hoy" sortKey="Today (P/E)" cfg={sortCfg} onSort={handleSort} center />
              </th>
              <th className="px-4 py-2.5 text-center">
                <SortBtn label="Mediana 10Y" sortKey="median" cfg={sortCfg} onSort={handleSort} center />
              </th>
              <th className="px-4 py-2.5 text-center">
                <SortBtn label="Descuento" sortKey="discount" cfg={sortCfg} onSort={handleSort} center />
              </th>
              <th className="px-4 py-2.5 text-left font-medium tracking-wide" style={{ color: "#64748B" }}>
                Range ±2σ
              </th>
            </tr>
          </thead>
          <tbody>
            {INDEX_GROUPS.map((group) => {
              const rows = sortRows(
                group.indices.map((idx) => dataMap.get(idx)).filter((r): r is ResumenRow => r !== undefined),
                sortCfg,
              );
              if (rows.length === 0) return null;
              return (
                <>
                  <tr key={`hdr-${group.label}`}>
                    <td
                      colSpan={5}
                      className="px-4 py-1.5 text-[10px] font-bold tracking-widest uppercase"
                      style={{ background: "#EEF2FA", color: "#64748B", borderBottom: "1px solid rgba(15,23,42,0.07)" }}
                    >
                      {group.label}
                    </td>
                  </tr>
                  {rows.map((row, i) => {
                    const slot = selectedIndices.indexOf(row.Index);
                    return (
                      <IndexRow
                        key={row.Index}
                        row={row}
                        slot={slot}
                        slotColor={slot !== -1 ? SLOT_COLORS[slot] : null}
                        isLast={i === rows.length - 1}
                        onSelectIndex={onSelectIndex}
                      />
                    );
                  })}
                </>
              );
            })}
            {/* Ungrouped indices at the end */}
            {ungrouped.length > 0 && (
              <>
                <tr key="hdr-otros">
                  <td
                    colSpan={5}
                    className="px-4 py-1.5 text-[10px] font-bold tracking-widest uppercase"
                    style={{ background: "#EEF2FA", color: "#64748B", borderBottom: "1px solid rgba(15,23,42,0.07)" }}
                  >
                    OTROS
                  </td>
                </tr>
                {sortRows(ungrouped, sortCfg).map((row, i) => {
                  const slot = selectedIndices.indexOf(row.Index);
                  return (
                    <IndexRow
                      key={row.Index}
                      row={row}
                      slot={slot}
                      slotColor={slot !== -1 ? SLOT_COLORS[slot] : null}
                      isLast={i === ungrouped.length - 1}
                      onSelectIndex={onSelectIndex}
                    />
                  );
                })}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
