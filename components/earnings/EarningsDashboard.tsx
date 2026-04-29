"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import type { EarningsRow, EarningsPayload } from "@/app/api/earnings/route";

// ── Design tokens ─────────────────────────────────────────────────────────────
const BLUE    = "#1D4ED8";
const BLUE_BG = "rgba(29,78,216,0.09)";
const BLUE_BD = "rgba(29,78,216,0.25)";
const NEG     = "#1E293B";
const NEG_BG  = "rgba(15,23,42,0.08)";
const NEG_BD  = "rgba(15,23,42,0.20)";
const TEXT1   = "#0F172A";
const TEXT2   = "#64748B";
const BORDER  = "rgba(15,23,42,0.08)";

const selectStyle: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid rgba(15,23,42,0.12)",
  borderRadius: 8,
  padding: "5px 10px",
  color: TEXT1,
  fontSize: 12,
  fontFamily: "JetBrains Mono, monospace",
  cursor: "pointer",
  outline: "none",
};

const FUND_OPTIONS = [
  { value: "ALL", label: "Todos los Tickers" },
  { value: "MLE", label: "Cartera MLE"       },
  { value: "MSC", label: "Cartera MSC"       },
];

// ── Sort types ────────────────────────────────────────────────────────────────
type TextSortKey    = "tickerBloomberg" | "sector" | "reportDate";
type NumericSortKey =
  | "revBeatMiss"    | "revYoy"    | "revQoq"
  | "ebitdaBeatMiss" | "ebitdaYoy" | "ebitdaQoq"
  | "niBeatMiss"     | "niYoy"     | "niQoq";

type SortKey = TextSortKey | NumericSortKey;
type SortDir = "asc" | "desc";

const NUMERIC_SORT_KEYS = new Set<SortKey>([
  "revBeatMiss", "revYoy", "revQoq",
  "ebitdaBeatMiss", "ebitdaYoy", "ebitdaQoq",
  "niBeatMiss", "niYoy", "niQoq",
]);

// ── Formatters ────────────────────────────────────────────────────────────────
function fmtActual(v: number | null): string {
  if (v === null) return "—";
  const abs = Math.abs(v);
  if (abs >= 1_000_000_000) return (v / 1_000_000_000).toFixed(1) + "B";
  if (abs >= 1_000_000)     return (v / 1_000_000).toFixed(1) + "M";
  if (abs >= 1_000)         return (v / 1_000).toFixed(1) + "K";
  return v.toFixed(0);
}

function fmtWt(v: number | null): string {
  if (v === null) return "—";
  return (v * 100).toFixed(2) + "%";
}

// ── Weighted totals ───────────────────────────────────────────────────────────
interface WeightedTotals {
  revActualUSD:    number | null;
  ebitdaActualUSD: number | null;
  niActualUSD:     number | null;
  revBeatMiss:     number | null;
  revYoy:          number | null;
  revQoq:          number | null;
  ebitdaBeatMiss:  number | null;
  ebitdaYoy:       number | null;
  ebitdaQoq:       number | null;
  niBeatMiss:      number | null;
  niYoy:           number | null;
  niQoq:           number | null;
}

function computeWeightedTotals(
  rows: EarningsRow[],
  getWeight: (r: EarningsRow) => number | null,
): WeightedTotals {
  function wtdActualUSD(getActual: (r: EarningsRow) => number | null): number | null {
    let sum = 0, hasAny = false;
    for (const r of rows) {
      const w = getWeight(r), a = getActual(r), rate = r.avgRate;
      if (w !== null && a !== null && rate !== null && rate !== 0) {
        sum += (a / rate) * w;
        hasAny = true;
      }
    }
    return hasAny ? sum : null;
  }

  function wtdPct(getMetric: (r: EarningsRow) => number | null): number | null {
    let num = 0, den = 0;
    for (const r of rows) {
      const w = getWeight(r), m = getMetric(r);
      if (w !== null && m !== null) { num += m * w; den += w; }
    }
    return den > 0 ? num / den : null;
  }

  return {
    revActualUSD:    wtdActualUSD((r) => r.revActual),
    ebitdaActualUSD: wtdActualUSD((r) => r.ebitdaActual),
    niActualUSD:     wtdActualUSD((r) => r.niActual),
    revBeatMiss:     wtdPct((r) => r.revBeatMiss),
    revYoy:          wtdPct((r) => r.revYoy),
    revQoq:          wtdPct((r) => r.revQoq),
    ebitdaBeatMiss:  wtdPct((r) => r.ebitdaBeatMiss),
    ebitdaYoy:       wtdPct((r) => r.ebitdaYoy),
    ebitdaQoq:       wtdPct((r) => r.ebitdaQoq),
    niBeatMiss:      wtdPct((r) => r.niBeatMiss),
    niYoy:           wtdPct((r) => r.niYoy),
    niQoq:           wtdPct((r) => r.niQoq),
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────
function PctBadge({ v }: { v: number | null }) {
  if (v === null) return <span style={{ color: "#CBD5E1", fontSize: 10, fontStyle: "italic" }}>NR</span>;
  const pct    = v * 100;
  const pos    = pct >  0.05;
  const neg    = pct < -0.05;
  const color  = pos ? BLUE : neg ? NEG  : TEXT2;
  const bg     = pos ? BLUE_BG : neg ? NEG_BG  : "transparent";
  const border = pos ? BLUE_BD : neg ? NEG_BD  : "transparent";
  return (
    <span style={{ color, background: bg, border: `1px solid ${border}`, borderRadius: 4, padding: "2px 6px", fontWeight: 800, fontSize: 11, whiteSpace: "nowrap" }}>
      {pos ? "+" : ""}{pct.toFixed(1)}%
    </span>
  );
}

function GrowthVal({ v }: { v: number | null }) {
  if (v === null) return <span style={{ color: "#CBD5E1", fontSize: 10, fontStyle: "italic" }}>NR</span>;
  const pct   = v * 100;
  const color = pct > 0.05 ? BLUE : pct < -0.05 ? NEG : TEXT2;
  return (
    <span style={{ color, fontWeight: 700, fontSize: 11 }}>
      {pct > 0 ? "+" : ""}{pct.toFixed(1)}%
    </span>
  );
}

function AvgCell({ vals }: { vals: (number | null)[] }) {
  const valid = vals.filter((v): v is number => v !== null);
  if (!valid.length) return <span style={{ color: TEXT2 }}>—</span>;
  const mean  = valid.reduce((a, b) => a + b, 0) / valid.length;
  const pct   = mean * 100;
  const color = pct > 0.05 ? BLUE : pct < -0.05 ? NEG : TEXT2;
  return (
    <span style={{ color, fontWeight: 700, fontSize: 11 }}>
      {pct > 0 ? "+" : ""}{pct.toFixed(1)}%
    </span>
  );
}

function OWCell({ v }: { v: number | null }) {
  if (v === null) return <span style={{ color: "#CBD5E1", fontSize: 10 }}>—</span>;
  const pct = v * 100;
  const pos = pct > 0.05;
  const neg = pct < -0.05;
  const color = pos ? BLUE : neg ? NEG : TEXT2;
  return (
    <span style={{ color, fontWeight: 700, fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}>
      {pos ? "+" : ""}{pct.toFixed(2)}%
    </span>
  );
}

function WtdPctCell({ v }: { v: number | null }) {
  if (v === null) return <span style={{ color: TEXT2 }}>—</span>;
  const pct   = v * 100;
  const color = pct > 0.05 ? BLUE : pct < -0.05 ? NEG : TEXT2;
  return (
    <span style={{ color, fontWeight: 700, fontSize: 11 }}>
      {pct > 0 ? "+" : ""}{pct.toFixed(1)}%
    </span>
  );
}

function WtdActualCell({ v }: { v: number | null }) {
  if (v === null) return <span style={{ color: TEXT2 }}>—</span>;
  return (
    <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: TEXT1, fontWeight: 600, whiteSpace: "nowrap" }}>
      <span style={{ fontSize: 9, color: TEXT2, marginRight: 3 }}>USD</span>
      {fmtActual(v)}
    </span>
  );
}

function SortTh({
  label, sortKey, sort, onSort, extraStyle, align = "center",
}: {
  label:       string;
  sortKey:     SortKey;
  sort:        { key: SortKey | null; dir: SortDir };
  onSort:      (k: SortKey) => void;
  extraStyle?: React.CSSProperties;
  align?:      "left" | "center";
}) {
  const active = sort.key === sortKey;
  return (
    <th
      onClick={() => onSort(sortKey)}
      style={{
        padding: align === "left" ? "5px 14px" : "5px 10px",
        textAlign: align,
        fontSize: 9,
        fontWeight: 600,
        letterSpacing: "0.07em",
        textTransform: "uppercase",
        color: active ? BLUE : "#94A3B8",
        background: active ? "rgba(29,78,216,0.05)" : "#F8FAFC",
        borderBottom: `1px solid ${BORDER}`,
        whiteSpace: "nowrap",
        cursor: "pointer",
        userSelect: "none",
        transition: "color 0.1s, background 0.1s",
        ...extraStyle,
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
        {label}
        {active
          ? sort.dir === "asc" ? <ChevronUp size={10} /> : <ChevronDown size={10} />
          : <ChevronsUpDown size={10} style={{ opacity: 0.3 }} />
        }
      </span>
    </th>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export default function EarningsDashboard() {
  const [allData,    setAllData]    = useState<EarningsRow[]>([]);
  const [quarters,   setQuarters]   = useState<string[]>([]);
  const [dates,      setDates]      = useState<string[]>([]);
  const [selQuarter, setSelQuarter] = useState("");
  const [selDate,    setSelDate]    = useState("");
  const [selFund,    setSelFund]    = useState("ALL");
  const [query,      setQuery]      = useState("");
  const [loading,    setLoading]    = useState(true);
  const [sort, setSort] = useState<{ key: SortKey | null; dir: SortDir }>({ key: null, dir: "desc" });

  const fetchData = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (selQuarter)        params.set("quarter", selQuarter);
    if (selDate)           params.set("date",    selDate);
    if (selFund !== "ALL") params.set("fund",    selFund);

    fetch(`/api/earnings?${params.toString()}`)
      .then((r) => r.json())
      .then((d: EarningsPayload) => {
        setAllData(d.data      ?? []);
        setQuarters(d.quarters ?? []);
        setDates(d.dates       ?? []);
      })
      .finally(() => setLoading(false));
  }, [selQuarter, selDate, selFund]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSort = useCallback((key: SortKey) => {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "desc" }
    );
  }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return allData;
    return allData.filter(
      (r) =>
        r.tickerBloomberg.toLowerCase().includes(q) ||
        (r.sector ?? "").toLowerCase().includes(q) ||
        r.quarter.toLowerCase().includes(q)
    );
  }, [allData, query]);

  const displayed = useMemo(() => {
    if (!sort.key) return filtered;
    const key = sort.key;
    const isNumeric = NUMERIC_SORT_KEYS.has(key);
    return [...filtered].sort((a, b) => {
      const av = a[key as keyof EarningsRow];
      const bv = b[key as keyof EarningsRow];
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      const diff = isNumeric
        ? (av as number) - (bv as number)
        : String(av).localeCompare(String(bv), undefined, { sensitivity: "base" });
      return sort.dir === "asc" ? diff : -diff;
    });
  }, [filtered, sort]);

  const avgs = useMemo(() => ({
    revBeatMiss:    displayed.map((r) => r.revBeatMiss),
    revYoy:         displayed.map((r) => r.revYoy),
    revQoq:         displayed.map((r) => r.revQoq),
    ebitdaBeatMiss: displayed.map((r) => r.ebitdaBeatMiss),
    ebitdaYoy:      displayed.map((r) => r.ebitdaYoy),
    ebitdaQoq:      displayed.map((r) => r.ebitdaQoq),
    niBeatMiss:     displayed.map((r) => r.niBeatMiss),
    niYoy:          displayed.map((r) => r.niYoy),
    niQoq:          displayed.map((r) => r.niQoq),
  }), [displayed]);

  const portfolioTotals = useMemo(
    () => selFund === "ALL" ? null : computeWeightedTotals(displayed, (r) => r.portfolioWeight),
    [displayed, selFund],
  );

  const benchmarkTotals = useMemo(
    () => selFund === "ALL" ? null : computeWeightedTotals(displayed, (r) => r.benchmarkWeight),
    [displayed, selFund],
  );

  const showWeights  = selFund !== "ALL";
  // Ticker + Sector + Quarter + ReportDate + CCY [+ Wp + Wb + OW]
  const infoColSpan  = showWeights ? 8 : 5;

  // ── Shared styles ─────────────────────────────────────────────────────────
  const sep: React.CSSProperties      = { borderRight: `1px solid ${BORDER}` };
  const thBase: React.CSSProperties   = {
    padding: "5px 10px",
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    color: "#94A3B8",
    background: "#F8FAFC",
    borderBottom: `1px solid ${BORDER}`,
    whiteSpace: "nowrap",
  };
  const tdNum: React.CSSProperties    = { padding: "8px 10px", textAlign: "center" };
  const tdSepNum: React.CSSProperties = { ...tdNum, ...sep };

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* ── Controls bar ──────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Buscar ticker o sector…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            fontSize: 11, padding: "6px 10px", borderRadius: 7,
            border: "1px solid rgba(15,23,42,0.12)", background: "#F8FAFC",
            color: TEXT1, outline: "none", width: 190,
            fontFamily: "JetBrains Mono, monospace",
          }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, color: TEXT2, fontFamily: "JetBrains Mono, monospace" }}>Quarter</span>
          <select value={selQuarter} onChange={(e) => setSelQuarter(e.target.value)} style={selectStyle}>
            <option value="">Todos</option>
            {quarters.map((q) => <option key={q} value={q}>{q}</option>)}
          </select>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, color: TEXT2, fontFamily: "JetBrains Mono, monospace" }}>Fecha</span>
          <select value={selDate} onChange={(e) => setSelDate(e.target.value)} style={selectStyle}>
            <option value="">Todas</option>
            {dates.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, color: TEXT2, fontFamily: "JetBrains Mono, monospace" }}>Fondo</span>
          <select value={selFund} onChange={(e) => setSelFund(e.target.value)} style={selectStyle}>
            {FUND_OPTIONS.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        <span style={{ fontSize: 11, color: TEXT2, fontFamily: "JetBrains Mono, monospace", marginLeft: "auto" }}>
          {displayed.length} {displayed.length === 1 ? "empresa" : "empresas"}
        </span>
      </div>

      {/* ── Table card ──────────────────────────────────────────────────────── */}
      <div style={{ background: "#FFFFFF", border: `1px solid ${BORDER}`, borderRadius: 12, boxShadow: "0 1px 4px rgba(15,23,42,0.06)", overflow: "hidden" }}>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 0", gap: 12 }}>
            <div style={{ width: 24, height: 24, borderRadius: "50%", border: "2px solid rgba(29,78,216,0.2)", borderTopColor: BLUE, animation: "spin 0.8s linear infinite" }} />
            <span style={{ fontSize: 12, color: TEXT2, fontFamily: "JetBrains Mono, monospace" }}>Cargando resultados…</span>
          </div>
        ) : displayed.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 0", color: TEXT2, fontSize: 13 }}>
            Sin datos{selQuarter ? ` para ${selQuarter}` : ""}
            {selDate ? ` del ${selDate}` : ""}
            {query ? ` que coincidan con "${query}"` : ""}.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                {/* ── Group row ─── */}
                <tr>
                  <th colSpan={infoColSpan} style={{ ...thBase, textAlign: "left", ...sep }} />
                  <th colSpan={4} style={{ ...thBase, textAlign: "center", color: "#1E3A8A", background: "rgba(30,58,138,0.07)", borderBottom: "2px solid rgba(30,58,138,0.22)", ...sep, fontWeight: 800, letterSpacing: "0.10em" }}>
                    Revenue
                  </th>
                  <th colSpan={4} style={{ ...thBase, textAlign: "center", color: "#1D4ED8", background: "rgba(29,78,216,0.07)", borderBottom: "2px solid rgba(29,78,216,0.22)", ...sep, fontWeight: 800, letterSpacing: "0.10em" }}>
                    EBITDA
                  </th>
                  <th colSpan={4} style={{ ...thBase, textAlign: "center", color: "#2563EB", background: "rgba(37,99,235,0.07)", borderBottom: "2px solid rgba(37,99,235,0.22)", fontWeight: 800, letterSpacing: "0.10em" }}>
                    Net Income
                  </th>
                </tr>
                {/* ── Sub-header ─── */}
                <tr>
                  <SortTh label="Ticker"      sortKey="tickerBloomberg" sort={sort} onSort={handleSort} align="left" />
                  <SortTh label="Sector"      sortKey="sector"          sort={sort} onSort={handleSort} align="left" />
                  <th style={{ ...thBase, textAlign: "center" }}>Quarter</th>
                  <SortTh label="Report Date" sortKey="reportDate"      sort={sort} onSort={handleSort} align="left" />
                  <th style={{ ...thBase, textAlign: "center", ...(showWeights ? {} : sep) }}>CCY</th>
                  {showWeights && (
                    <>
                      <th style={{ ...thBase, textAlign: "center" }}>W_p</th>
                      <th style={{ ...thBase, textAlign: "center" }}>W_b</th>
                      <th style={{ ...thBase, textAlign: "center", ...sep }}>OW</th>
                    </>
                  )}
                  {/* Revenue */}
                  <th style={{ ...thBase, textAlign: "right", padding: "5px 12px" }}>Actual</th>
                  <SortTh label="Beat/Miss" sortKey="revBeatMiss"    sort={sort} onSort={handleSort} />
                  <SortTh label="YoY"       sortKey="revYoy"         sort={sort} onSort={handleSort} />
                  <SortTh label="QoQ"       sortKey="revQoq"         sort={sort} onSort={handleSort} extraStyle={sep} />
                  {/* EBITDA */}
                  <th style={{ ...thBase, textAlign: "right", padding: "5px 12px" }}>Actual</th>
                  <SortTh label="Beat/Miss" sortKey="ebitdaBeatMiss" sort={sort} onSort={handleSort} />
                  <SortTh label="YoY"       sortKey="ebitdaYoy"      sort={sort} onSort={handleSort} />
                  <SortTh label="QoQ"       sortKey="ebitdaQoq"      sort={sort} onSort={handleSort} extraStyle={sep} />
                  {/* Net Income */}
                  <th style={{ ...thBase, textAlign: "right", padding: "5px 12px" }}>Actual</th>
                  <SortTh label="Beat/Miss" sortKey="niBeatMiss"     sort={sort} onSort={handleSort} />
                  <SortTh label="YoY"       sortKey="niYoy"          sort={sort} onSort={handleSort} />
                  <SortTh label="QoQ"       sortKey="niQoq"          sort={sort} onSort={handleSort} />
                </tr>
              </thead>

              <tbody>
                {displayed.map((row, i) => (
                  <tr
                    key={`${row.tickerBloomberg}-${row.quarter}`}
                    style={{ background: i % 2 === 0 ? "#FFFFFF" : "rgba(15,23,42,0.018)", borderBottom: "1px solid rgba(15,23,42,0.05)", transition: "background 0.1s" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(29,78,216,0.04)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = i % 2 === 0 ? "#FFFFFF" : "rgba(15,23,42,0.018)"; }}
                  >
                    {/* Info */}
                    <td style={{ padding: "8px 14px", fontFamily: "JetBrains Mono, monospace", fontWeight: 700, color: BLUE, whiteSpace: "nowrap", fontSize: 11 }}>
                      {row.tickerBloomberg}
                    </td>
                    <td style={{ padding: "8px 12px", fontSize: 11, color: TEXT2, whiteSpace: "nowrap", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {row.sector ?? "—"}
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "center" }}>
                      <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, fontWeight: 800, color: TEXT1, background: "rgba(15,23,42,0.05)", borderRadius: 4, padding: "2px 7px" }}>
                        {row.quarter}
                      </span>
                    </td>
                    <td style={{ padding: "8px 14px", fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: TEXT2, whiteSpace: "nowrap" }}>
                      {row.reportDate}
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "center", ...(showWeights ? {} : sep) }}>
                      {row.currency
                        ? <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, fontWeight: 700, color: TEXT2, background: "rgba(15,23,42,0.04)", border: `1px solid ${BORDER}`, borderRadius: 4, padding: "1px 5px" }}>{row.currency}</span>
                        : <span style={{ color: "#CBD5E1", fontSize: 10 }}>—</span>
                      }
                    </td>
                    {showWeights && (
                      <>
                        <td style={{ ...tdNum }}>
                          <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: TEXT2, fontWeight: 600 }}>
                            {fmtWt(row.portfolioWeight)}
                          </span>
                        </td>
                        <td style={{ ...tdNum }}>
                          <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: TEXT2, fontWeight: 600 }}>
                            {fmtWt(row.benchmarkWeight)}
                          </span>
                        </td>
                        <td style={{ ...tdNum, ...sep }}>
                          <OWCell v={row.overweight} />
                        </td>
                      </>
                    )}
                    {/* Revenue */}
                    <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: TEXT1, fontWeight: 600 }}>
                      {fmtActual(row.revActual)}
                    </td>
                    <td style={tdNum}><PctBadge v={row.revBeatMiss} /></td>
                    <td style={tdNum}><GrowthVal v={row.revYoy} /></td>
                    <td style={tdSepNum}><GrowthVal v={row.revQoq} /></td>
                    {/* EBITDA */}
                    <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: TEXT1, fontWeight: 600 }}>
                      {fmtActual(row.ebitdaActual)}
                    </td>
                    <td style={tdNum}><PctBadge v={row.ebitdaBeatMiss} /></td>
                    <td style={tdNum}><GrowthVal v={row.ebitdaYoy} /></td>
                    <td style={tdSepNum}><GrowthVal v={row.ebitdaQoq} /></td>
                    {/* Net Income */}
                    <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: TEXT1, fontWeight: 600 }}>
                      {fmtActual(row.niActual)}
                    </td>
                    <td style={tdNum}><PctBadge v={row.niBeatMiss} /></td>
                    <td style={tdNum}><GrowthVal v={row.niYoy} /></td>
                    <td style={tdNum}><GrowthVal v={row.niQoq} /></td>
                  </tr>
                ))}
              </tbody>

              {/* ── Footer ───────────────────────────────────────────────── */}
              <tfoot>
                {!showWeights ? (
                  /* Simple unweighted average when fund = ALL */
                  <tr style={{ background: "#EFF6FF", borderTop: "2px solid #1E3A8A" }}>
                    <td colSpan={5} style={{ padding: "9px 14px", fontSize: 10, fontWeight: 800, color: "#1E3A8A", letterSpacing: "0.08em", textTransform: "uppercase", ...sep }}>
                      Promedio simple ({displayed.length})
                    </td>
                    <td style={{ padding: "9px 12px" }} />
                    <td style={tdNum}><AvgCell vals={avgs.revBeatMiss} /></td>
                    <td style={tdNum}><AvgCell vals={avgs.revYoy} /></td>
                    <td style={tdSepNum}><AvgCell vals={avgs.revQoq} /></td>
                    <td style={{ padding: "9px 12px" }} />
                    <td style={tdNum}><AvgCell vals={avgs.ebitdaBeatMiss} /></td>
                    <td style={tdNum}><AvgCell vals={avgs.ebitdaYoy} /></td>
                    <td style={tdSepNum}><AvgCell vals={avgs.ebitdaQoq} /></td>
                    <td style={{ padding: "9px 12px" }} />
                    <td style={tdNum}><AvgCell vals={avgs.niBeatMiss} /></td>
                    <td style={tdNum}><AvgCell vals={avgs.niYoy} /></td>
                    <td style={tdNum}><AvgCell vals={avgs.niQoq} /></td>
                  </tr>
                ) : (
                  /* Weighted Portfolio + Benchmark rows */
                  <>
                    <tr style={{ background: "#EFF6FF", borderTop: "2px solid #1E3A8A" }}>
                      <td colSpan={infoColSpan} style={{ padding: "9px 14px", fontSize: 10, fontWeight: 800, color: "#1E3A8A", letterSpacing: "0.08em", textTransform: "uppercase", ...sep }}>
                        Total Portfolio
                      </td>
                      <td style={{ padding: "9px 12px", textAlign: "right" }}><WtdActualCell v={portfolioTotals?.revActualUSD ?? null} /></td>
                      <td style={tdNum}><WtdPctCell v={portfolioTotals?.revBeatMiss    ?? null} /></td>
                      <td style={tdNum}><WtdPctCell v={portfolioTotals?.revYoy         ?? null} /></td>
                      <td style={tdSepNum}><WtdPctCell v={portfolioTotals?.revQoq      ?? null} /></td>
                      <td style={{ padding: "9px 12px", textAlign: "right" }}><WtdActualCell v={portfolioTotals?.ebitdaActualUSD ?? null} /></td>
                      <td style={tdNum}><WtdPctCell v={portfolioTotals?.ebitdaBeatMiss ?? null} /></td>
                      <td style={tdNum}><WtdPctCell v={portfolioTotals?.ebitdaYoy      ?? null} /></td>
                      <td style={tdSepNum}><WtdPctCell v={portfolioTotals?.ebitdaQoq   ?? null} /></td>
                      <td style={{ padding: "9px 12px", textAlign: "right" }}><WtdActualCell v={portfolioTotals?.niActualUSD ?? null} /></td>
                      <td style={tdNum}><WtdPctCell v={portfolioTotals?.niBeatMiss     ?? null} /></td>
                      <td style={tdNum}><WtdPctCell v={portfolioTotals?.niYoy          ?? null} /></td>
                      <td style={tdNum}><WtdPctCell v={portfolioTotals?.niQoq          ?? null} /></td>
                    </tr>
                    <tr style={{ background: "rgba(241,245,249,0.9)", borderTop: `1px solid ${BORDER}` }}>
                      <td colSpan={infoColSpan} style={{ padding: "9px 14px", fontSize: 10, fontWeight: 800, color: "#334155", letterSpacing: "0.08em", textTransform: "uppercase", ...sep }}>
                        Total Benchmark
                      </td>
                      <td style={{ padding: "9px 12px", textAlign: "right" }}><WtdActualCell v={benchmarkTotals?.revActualUSD ?? null} /></td>
                      <td style={tdNum}><WtdPctCell v={benchmarkTotals?.revBeatMiss    ?? null} /></td>
                      <td style={tdNum}><WtdPctCell v={benchmarkTotals?.revYoy         ?? null} /></td>
                      <td style={tdSepNum}><WtdPctCell v={benchmarkTotals?.revQoq      ?? null} /></td>
                      <td style={{ padding: "9px 12px", textAlign: "right" }}><WtdActualCell v={benchmarkTotals?.ebitdaActualUSD ?? null} /></td>
                      <td style={tdNum}><WtdPctCell v={benchmarkTotals?.ebitdaBeatMiss ?? null} /></td>
                      <td style={tdNum}><WtdPctCell v={benchmarkTotals?.ebitdaYoy      ?? null} /></td>
                      <td style={tdSepNum}><WtdPctCell v={benchmarkTotals?.ebitdaQoq   ?? null} /></td>
                      <td style={{ padding: "9px 12px", textAlign: "right" }}><WtdActualCell v={benchmarkTotals?.niActualUSD ?? null} /></td>
                      <td style={tdNum}><WtdPctCell v={benchmarkTotals?.niBeatMiss     ?? null} /></td>
                      <td style={tdNum}><WtdPctCell v={benchmarkTotals?.niYoy          ?? null} /></td>
                      <td style={tdNum}><WtdPctCell v={benchmarkTotals?.niQoq          ?? null} /></td>
                    </tr>
                  </>
                )}
              </tfoot>
            </table>

            {/* Legend */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 14px", borderTop: `1px solid ${BORDER}` }}>
              <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: BLUE, opacity: 0.85, display: "inline-block" }} />
                  <span style={{ fontSize: 10, color: TEXT2 }}>Beat / Positivo / OW</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: NEG, opacity: 0.75, display: "inline-block" }} />
                  <span style={{ fontSize: 10, color: TEXT2 }}>Miss / Negativo / UW</span>
                </div>
                <span style={{ fontSize: 10, color: "#CBD5E1", fontStyle: "italic" }}>NR = Not Reported</span>
                {showWeights && (
                  <span style={{ fontSize: 10, color: TEXT2 }}>Actuals en USD ponderados por peso</span>
                )}
              </div>
              <span style={{ fontSize: 10, color: "#CBD5E1" }}>Fuente: Bloomberg</span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
