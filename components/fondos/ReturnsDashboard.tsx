"use client";

import { useEffect, useState, useMemo } from "react";
import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface RentabilidadRow {
  fund: string;
  manager: string;
  group: string;
  currency: string;
  mtd: number | null;
  ytd: number | null;
  oneYear: number | null;
  threeYears: number | null;
  fiveYears: number | null;
  tenYears: number | null;
  aum: number | null;
  sharpe: number | null;
  mgmtFee: number | null;
  annSinceIncep: number | null;
  isMoneda: boolean;
}

type NRow = RentabilidadRow & { displayGroup: string };

interface ApiResponse {
  reportDate: string;
  file: string;
  rows: RentabilidadRow[];
  timeseries?: TimeseriesPoint[];
  fundMeta?: Record<string, FundMeta>;
}

interface FundMeta {
  group: string;
  isMoneda: boolean;
}

interface TimeseriesPoint {
  date: string;
  [fund: string]: string | number | null;
}

interface Props {
  pageNum: string;
  fundDisplayName: string;
}

type SortableKey =
  | "fund"
  | "manager"
  | "aum"
  | "mtd"
  | "ytd"
  | "oneYear"
  | "threeYears"
  | "fiveYears"
  | "tenYears"
  | "annSinceIncep"
  | "sharpe"
  | "mgmtFee";

interface SortConfig {
  key: SortableKey;
  direction: "asc" | "desc";
}

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtPct(v: number | null, decimals = 1): string {
  if (v === null) return "—";
  return (v * 100).toFixed(decimals) + "%";
}

function fmtAum(v: number | null): string {
  if (v === null) return "—";
  return v.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function fmtSharpe(v: number | null): string {
  if (v === null) return "—";
  return v.toFixed(2);
}

function fmtFee(v: number | null): string {
  if (v === null) return "—";
  return (v * 100).toFixed(2) + "%";
}

function pctColor(v: number | null): string {
  if (v === null) return "#CBD5E1";
  if (v > 0) return "#10B981";
  if (v < 0) return "#EF4444";
  return "#64748B";
}

/** Normalize CSV group → display group name */
function normalizeGroup(group: string, fund: string): string {
  if (group === "Moneda") return "Moneda Funds";
  if (group === "Other Moneda Funds Returns") {
    if (fund === "Glory" || fund === "Mercer") return "Moneda Funds";
    return "Other Moneda Funds";
  }
  return group;
}

// ── Column definitions ────────────────────────────────────────────────────────

interface ColDef {
  label: string;
  textValue: (r: NRow) => string;
  color: (r: NRow) => string;
  right: boolean;
  mono: boolean;
  sortKey?: SortableKey;
}

function pctColDef(
  label: string,
  getValue: (r: NRow) => number | null,
  sortKey: SortableKey
): ColDef {
  return {
    label,
    textValue: (r) => fmtPct(getValue(r)),
    color: (r) => pctColor(getValue(r)),
    right: true,
    mono: true,
    sortKey,
  };
}

const TABLE_COLS: ColDef[] = [
  {
    label: "MANAGER",
    textValue: (r) => r.manager || "—",
    color: (r) => (r.manager ? "#475569" : "#CBD5E1"),
    right: false,
    mono: false,
    sortKey: "manager",
  },
  {
    label: "AUM ($MM)",
    textValue: (r) => fmtAum(r.aum),
    color: (r) => (r.aum === null ? "#CBD5E1" : "#475569"),
    right: true,
    mono: true,
    sortKey: "aum",
  },
  pctColDef("MTD", (r) => r.mtd, "mtd"),
  pctColDef("YTD", (r) => r.ytd, "ytd"),
  pctColDef("1 YEAR", (r) => r.oneYear, "oneYear"),
  pctColDef("3 YEARS", (r) => r.threeYears, "threeYears"),
  pctColDef("5 YEARS", (r) => r.fiveYears, "fiveYears"),
  pctColDef("10 YEARS", (r) => r.tenYears, "tenYears"),
  pctColDef("SINCE INCEP.", (r) => r.annSinceIncep, "annSinceIncep"),
  {
    label: "SHARPE",
    textValue: (r) => fmtSharpe(r.sharpe),
    color: (r) => (r.sharpe === null ? "#CBD5E1" : "#475569"),
    right: true,
    mono: true,
    sortKey: "sharpe",
  },
  {
    label: "MGMT FEE",
    textValue: (r) => fmtFee(r.mgmtFee),
    color: (r) => (r.mgmtFee === null ? "#CBD5E1" : "#475569"),
    right: true,
    mono: true,
    sortKey: "mgmtFee",
  },
];

// Total column count = 1 (FUND) + TABLE_COLS.length = 12
const TOTAL_COLS = 1 + TABLE_COLS.length;

// ── Chart helpers ─────────────────────────────────────────────────────────────

function fmtShortDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return date.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
}

function seriesStyle(meta?: FundMeta): { stroke: string; width: number; dash?: string } {
  if (!meta) return { stroke: "#CBD5E1", width: 1.5 };
  if (meta.group === "Moneda") {
    return { stroke: "#1D4ED8", width: 3 };
  }
  if (meta.group === "Indices") {
    return { stroke: "#64748B", width: 1.5 };
  }
  if (meta.group.startsWith("Peer")) {
    return { stroke: "#CBD5E1", width: 1.5, dash: "5 5" };
  }
  return { stroke: "#CBD5E1", width: 1.5 };
}

// ── Chart tooltip (sorted desc by value) ──────────────────────────────────────

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string; value?: number | null; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const visible = payload.filter(
    (p): p is { dataKey: string; value: number; color?: string } =>
      typeof p.dataKey === "string" && typeof p.value === "number"
  );
  if (visible.length === 0) return null;

  // Sort descending by value (safe null fallback)
  const sorted = [...visible].sort((a, b) => (b.value ?? -999) - (a.value ?? -999));

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #E2E8F0",
        borderRadius: 8,
        padding: "8px 12px",
        fontSize: 12,
        boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
      }}
    >
      <div style={{ fontWeight: 700, color: "#0F172A", marginBottom: 6 }}>
        {label ? fmtShortDate(label) : ""}
      </div>
      <div style={{ display: "grid", gap: 4 }}>
        {sorted.map((p) => (
          <div key={p.dataKey} style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
            <span style={{ color: p.color ?? "#64748B", fontSize: 11 }}>{p.dataKey}</span>
            <span style={{ fontWeight: 600, color: pctColor(p.value) }}>{fmtPct(p.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Sort comparator ───────────────────────────────────────────────────────────

function compareRows(a: NRow, b: NRow, cfg: SortConfig): number {
  const av = a[cfg.key];
  const bv = b[cfg.key];
  if (av === null || av === undefined) return 1;
  if (bv === null || bv === undefined) return -1;
  if (typeof av === "string" && typeof bv === "string") {
    const cmp = av.localeCompare(bv);
    return cfg.direction === "asc" ? cmp : -cmp;
  }
  const an = av as number;
  const bn = bv as number;
  return cfg.direction === "asc" ? an - bn : bn - an;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ReturnsDashboard({ pageNum, fundDisplayName }: Props) {
  const [rows, setRows] = useState<RentabilidadRow[]>([]);
  const [timeseries, setTimeseries] = useState<TimeseriesPoint[]>([]);
  const [fundMeta, setFundMeta] = useState<Record<string, FundMeta>>({});
  const [reportDate, setReportDate] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Filter & sort state ──────────────────────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState("");
  const [groupFilter, setGroupFilter] = useState("All");
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    // Reset filters when fund changes
    setSearchTerm("");
    setGroupFilter("All");
    setSortConfig(null);
    fetch(`/api/rentabilidades?page=${pageNum}`)
      .then((r) => r.json())
      .then((d: ApiResponse) => {
        setRows(d.rows ?? []);
        setTimeseries(d.timeseries ?? []);
        setFundMeta(d.fundMeta ?? {});
        setReportDate(d.reportDate ?? "");
        setLoading(false);
      })
      .catch(() => {
        setError("Could not load returns data");
        setLoading(false);
      });
  }, [pageNum]);

  // ── Derived data (memoized) — must be above early returns ────────────────────

  const MONEDA = "Moneda Funds";
  const INDICES = "Indices";
  const OTHER = "Other Moneda Funds";

  const normalized: NRow[] = useMemo(
    () => rows.map((r) => ({ ...r, displayGroup: normalizeGroup(r.group, r.fund) })),
    [rows]
  );

  // Stable ordered group list (always Moneda → Peers → Indices → Other)
  const orderedGroups = useMemo<string[]>(() => {
    const seenGroups = new Set<string>();
    const result: string[] = [];
    if (normalized.some((r) => r.displayGroup === MONEDA)) {
      seenGroups.add(MONEDA);
      result.push(MONEDA);
    }
    for (const r of normalized) {
      if (
        !seenGroups.has(r.displayGroup) &&
        r.displayGroup !== INDICES &&
        r.displayGroup !== OTHER
      ) {
        seenGroups.add(r.displayGroup);
        result.push(r.displayGroup);
      }
    }
    if (normalized.some((r) => r.displayGroup === INDICES)) result.push(INDICES);
    if (normalized.some((r) => r.displayGroup === OTHER)) result.push(OTHER);
    return result;
  }, [normalized]);

  // Filtered + sorted + regrouped map
  // Step A → filter, Step B → sort flat array, Step C → regroup preserving canonical order
  const processedGrouped = useMemo<Map<string, NRow[]>>(() => {
    // Step A: filter by search and category
    let filtered = normalized.filter((r) => {
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const matchName = r.fund.toLowerCase().includes(q);
        const matchMgr = (r.manager ?? "").toLowerCase().includes(q);
        if (!matchName && !matchMgr) return false;
      }
      if (groupFilter !== "All") {
        if (groupFilter === "Moneda") {
          if (r.displayGroup !== MONEDA && r.displayGroup !== OTHER) return false;
        } else if (groupFilter === "Indices") {
          if (r.displayGroup !== INDICES) return false;
        } else if (groupFilter === "Peer Group") {
          if (
            r.displayGroup === MONEDA ||
            r.displayGroup === INDICES ||
            r.displayGroup === OTHER
          ) return false;
        }
      }
      return true;
    });

    // Step B: sort the entire flat array (nulls always last)
    if (sortConfig) {
      filtered = [...filtered].sort((a, b) => compareRows(a, b, sortConfig));
    }

    // Step C: regroup in canonical order (Moneda → Peers → Indices → Other)
    //         within each group, rows keep the relative order from Step B
    const result = new Map<string, NRow[]>();
    for (const g of orderedGroups) {
      const gRows = filtered.filter((r) => r.displayGroup === g);
      if (gRows.length > 0) result.set(g, gRows);
    }
    return result;
  }, [normalized, orderedGroups, searchTerm, groupFilter, sortConfig]);

  // ── Early returns (after all hooks) ──────────────────────────────────────────

  if (loading) {
    return (
      <div
        className="card mb-5"
        style={{ height: 120, display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        <div
          className="w-6 h-6 rounded-full border-2 animate-spin"
          style={{ borderColor: "rgba(43,92,224,0.15)", borderTopColor: "#2B5CE0" }}
        />
      </div>
    );
  }

  if (error || rows.length === 0) return null;

  const visibleGroups = orderedGroups.filter((g) => (processedGrouped.get(g)?.length ?? 0) > 0);

  // ── Chart series ──────────────────────────────────────────────────────────────
  const lineFundNames = Object.keys(fundMeta);
  const orderedLineFunds = lineFundNames.sort((a, b) => {
    const ma = fundMeta[a];
    const mb = fundMeta[b];
    const wa = ma?.group === "Moneda" ? 0 : ma?.group === "Indices" ? 1 : 2;
    const wb = mb?.group === "Moneda" ? 0 : mb?.group === "Indices" ? 1 : 2;
    if (wa !== wb) return wa - wb;
    return a.localeCompare(b);
  });

  const currency = rows[0]?.currency ?? "";

  // ── Sort toggle handler ───────────────────────────────────────────────────────
  function handleSort(key: SortableKey) {
    setSortConfig((prev) => {
      if (prev?.key === key) {
        return { key, direction: prev.direction === "desc" ? "asc" : "desc" };
      }
      return { key, direction: "desc" };
    });
  }

  function sortIndicator(key?: SortableKey) {
    if (!key || sortConfig?.key !== key) {
      return <span style={{ opacity: 0.25, marginLeft: 3, fontSize: 9 }}>⇅</span>;
    }
    return (
      <span style={{ color: "#2B5CE0", marginLeft: 3, fontSize: 9 }}>
        {sortConfig.direction === "desc" ? "↓" : "↑"}
      </span>
    );
  }

  return (
    <div className="card mb-5" style={{ overflow: "hidden", padding: 0 }}>

      {/* ── Header ────────────────────────────────────────────────────────────── */}
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
          RETURNS DASHBOARD — {fundDisplayName.toUpperCase()}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {currency && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: "#94A3B8",
                background: "rgba(15,23,42,0.04)",
                border: "1px solid rgba(15,23,42,0.08)",
                borderRadius: 4,
                padding: "2px 7px",
              }}
            >
              {currency}
            </span>
          )}
          {reportDate && (
            <span style={{ fontSize: 10, color: "#CBD5E1" }}>as of {reportDate}</span>
          )}
        </div>
      </div>

      {/* ── Weekly YTD Line Chart ───────────────────────────────────────────── */}
      {timeseries.length > 0 && orderedLineFunds.length > 0 && (
        <div style={{ borderBottom: "1px solid rgba(15,23,42,0.06)" }}>
          <div
            style={{
              padding: "8px 18px 4px",
              fontSize: 10,
              fontWeight: 600,
              color: "#94A3B8",
              letterSpacing: "0.06em",
            }}
          >
            WEEKLY YTD EVOLUTION (CURRENT YEAR)
          </div>
          <div style={{ height: 300, padding: "0 8px 8px" }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timeseries} margin={{ top: 8, right: 20, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v) => fmtShortDate(String(v))}
                  tick={{ fontSize: 12, fill: "#94A3B8" }}
                  minTickGap={15}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => fmtPct(typeof v === "number" ? v : null)}
                  tick={{ fontSize: 10, fill: "#94A3B8" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {orderedLineFunds.map((fund) => {
                  const style = seriesStyle(fundMeta[fund]);
                  return (
                    <Line
                      key={fund}
                      type="monotone"
                      dataKey={fund}
                      dot={false}
                      connectNulls={true}
                      stroke={style.stroke}
                      strokeWidth={style.width}
                      strokeDasharray={style.dash}
                      isAnimationActive={false}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Filter Toolbar ───────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 18px",
          borderBottom: "1px solid rgba(15,23,42,0.06)",
          background: "#FAFBFC",
        }}
      >
        {/* Search input */}
        <div style={{ position: "relative", flex: "0 0 220px" }}>
          <span
            style={{
              position: "absolute",
              left: 8,
              top: "50%",
              transform: "translateY(-50%)",
              color: "#94A3B8",
              fontSize: 12,
              pointerEvents: "none",
            }}
          >
            ⌕
          </span>
          <input
            type="text"
            placeholder="Search fund or manager…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: "100%",
              paddingLeft: 24,
              paddingRight: 8,
              paddingTop: 5,
              paddingBottom: 5,
              fontSize: 11,
              border: "1px solid #E2E8F0",
              borderRadius: 5,
              background: "#fff",
              color: "#334155",
              outline: "none",
            }}
          />
        </div>

        {/* Category filter */}
        <select
          value={groupFilter}
          onChange={(e) => setGroupFilter(e.target.value)}
          style={{
            padding: "5px 8px",
            fontSize: 11,
            border: "1px solid #E2E8F0",
            borderRadius: 5,
            background: "#fff",
            color: "#334155",
            cursor: "pointer",
            outline: "none",
          }}
        >
          <option value="All">All Categories</option>
          <option value="Moneda">Moneda</option>
          <option value="Peer Group">Peer Group</option>
          <option value="Indices">Indices</option>
        </select>

        {/* Active sort badge */}
        {sortConfig && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                fontSize: 10,
                color: "#94A3B8",
                background: "rgba(43,92,224,0.06)",
                border: "1px solid rgba(43,92,224,0.15)",
                borderRadius: 4,
                padding: "2px 8px",
                fontWeight: 500,
              }}
            >
              Sorted by {sortConfig.key} {sortConfig.direction === "desc" ? "↓" : "↑"}
            </span>
            <button
              onClick={() => setSortConfig(null)}
              style={{
                fontSize: 10,
                color: "#94A3B8",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "2px 4px",
              }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Result count */}
        <span style={{ marginLeft: "auto", fontSize: 10, color: "#CBD5E1" }}>
          {Array.from(processedGrouped.values()).reduce((acc, g) => acc + g.length, 0)} funds
        </span>
      </div>

      {/* ── Grouped Returns Table ────────────────────────────────────────────── */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>

          {/* Sticky header */}
          <thead>
            <tr style={{ background: "#F0F4FA" }}>
              {/* FUND — sticky, clickable */}
              <th
                onClick={() => handleSort("fund")}
                style={{
                  position: "sticky",
                  left: 0,
                  zIndex: 10,
                  background: "#F0F4FA",
                  boxShadow: "2px 0 4px rgba(15,23,42,0.06)",
                  padding: "8px 18px",
                  textAlign: "left",
                  fontSize: 9,
                  fontWeight: 600,
                  color: sortConfig?.key === "fund" ? "#2B5CE0" : "#64748B",
                  letterSpacing: "0.08em",
                  minWidth: 200,
                  whiteSpace: "nowrap",
                  cursor: "pointer",
                  userSelect: "none",
                }}
              >
                FUND {sortIndicator("fund")}
              </th>

              {TABLE_COLS.map((col) => (
                <th
                  key={col.label}
                  onClick={() => col.sortKey && handleSort(col.sortKey)}
                  style={{
                    padding: "8px 14px",
                    textAlign: col.right ? "right" : "left",
                    fontSize: 9,
                    fontWeight: 600,
                    color: col.sortKey && sortConfig?.key === col.sortKey ? "#2B5CE0" : "#64748B",
                    letterSpacing: "0.08em",
                    minWidth: col.label === "MANAGER" ? 110 : 76,
                    whiteSpace: "nowrap",
                    cursor: col.sortKey ? "pointer" : "default",
                    userSelect: "none",
                  }}
                >
                  {col.label} {sortIndicator(col.sortKey)}
                </th>
              ))}
            </tr>
          </thead>

          {/* One <tbody> per visible group */}
          {visibleGroups.map((group) => {
            const groupRows = processedGrouped.get(group) ?? [];
            const isMonedaGroup = group === MONEDA;

            return (
              <tbody key={group}>
                {/* Group header row — subtle section divider */}
                <tr>
                  <td
                    colSpan={TOTAL_COLS}
                    className="bg-slate-50 text-slate-500 font-semibold uppercase border-y border-slate-200"
                    style={{
                      position: "sticky",
                      left: 0,
                      padding: "6px 18px",
                      fontSize: 10,
                      letterSpacing: "0.12em",
                    }}
                  >
                    {group}
                  </td>
                </tr>

                {/* Data rows */}
                {groupRows.map((row, i) => {
                  const rowBg = i % 2 === 0 ? "#ffffff" : "#F9FAFB";
                  return (
                    <tr
                      key={`${group}-${row.fund}-${i}`}
                      style={{
                        background: rowBg,
                        borderBottom: "1px solid rgba(15,23,42,0.04)",
                      }}
                    >
                      {/* FUND cell — sticky */}
                      <td
                        style={{
                          position: "sticky",
                          left: 0,
                          zIndex: 5,
                          background: rowBg,
                          boxShadow: "2px 0 4px rgba(15,23,42,0.05)",
                          padding: "9px 18px",
                          minWidth: 200,
                          whiteSpace: "nowrap",
                        }}
                      >
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: row.isMoneda ? 600 : 500,
                            color: row.isMoneda ? "#1E3A8A" : "#334155",
                          }}
                        >
                          {row.fund}
                        </span>
                      </td>

                      {/* Dynamic columns */}
                      {TABLE_COLS.map((col) => {
                        const text = col.textValue(row);
                        const isDash = text === "—";
                        return (
                          <td
                            key={col.label}
                            style={{
                              padding: "9px 14px",
                              textAlign: isDash ? "center" : col.right ? "right" : "left",
                              fontFamily: col.mono ? "monospace" : "inherit",
                              fontSize: 12,
                              fontWeight: 500,
                              color: col.color(row),
                              whiteSpace: "nowrap",
                            }}
                          >
                            {text}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            );
          })}

          {/* Empty state */}
          {visibleGroups.length === 0 && (
            <tbody>
              <tr>
                <td
                  colSpan={TOTAL_COLS}
                  style={{
                    padding: "32px 18px",
                    textAlign: "center",
                    fontSize: 12,
                    color: "#CBD5E1",
                  }}
                >
                  No funds match the current filters.
                </td>
              </tr>
            </tbody>
          )}
        </table>
      </div>
    </div>
  );
}
