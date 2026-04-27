"use client";

import { useState, useEffect, useCallback } from "react";
import type { FlatAttributionPayload, AssetAttribution } from "@/app/api/attribution/flat/route";

// ── Tokens ────────────────────────────────────────────────────────────────────
const BORDER   = "rgba(15,23,42,0.08)";
const TEXT1    = "#0F172A";
const TEXT2    = "#64748B";
const GREEN    = "#059669";
const RED      = "#DC2626";
const BLUE     = "#2563EB";
const cardStyle: React.CSSProperties = {
  background: "#FFFFFF",
  border: `1px solid ${BORDER}`,
  borderRadius: 12,
  boxShadow: "0 1px 4px rgba(15,23,42,0.06)",
};

// ── Config ────────────────────────────────────────────────────────────────────
const FUNDS = [
  { value: "Moneda_Latin_America_Equities_(LX)",  label: "LA Equities (LX)",   bench: "MXLA Index"   },
  { value: "Moneda_Latin_America_Small_Cap_(LX)", label: "LA Small Cap (LX)",  bench: "MXLASC Index" },
];

const PERIODS = [
  { value: "retYtd", label: "YTD"  },
  { value: "ret1W",  label: "1 Week" },
  { value: "ret1M",  label: "1 Month" },
  { value: "ret1Y",  label: "1 Year"  },
];

// ── Formatters ────────────────────────────────────────────────────────────────
function fmtPct(v: number, dec = 2): string {
  const pct = v * 100;
  return (pct >= 0 ? "+" : "") + pct.toFixed(dec) + "%";
}
function pctColor(v: number): string {
  return v > 0 ? GREEN : v < 0 ? RED : TEXT2;
}
function fmtW(v: number): string {
  return (v * 100).toFixed(2) + "%";
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({
  label, value, valueColor, sub,
}: { label: string; value: string; valueColor?: string; sub?: string }) {
  return (
    <div style={{ ...cardStyle, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.10em", color: TEXT2, textTransform: "uppercase" }}>
        {label}
      </span>
      <span style={{ fontSize: 26, fontWeight: 800, fontFamily: "JetBrains Mono, monospace", color: valueColor ?? TEXT1, letterSpacing: "-0.02em" }}>
        {value}
      </span>
      {sub && <span style={{ fontSize: 10, color: TEXT2 }}>{sub}</span>}
    </div>
  );
}

// ── Sort types ────────────────────────────────────────────────────────────────
type SortKey = keyof Pick<AssetAttribution, "ticker" | "wp" | "wb" | "activeWeight" | "ret" | "allocationEffect" | "totalEffect">;

// ── Table ─────────────────────────────────────────────────────────────────────
function AttributionTable({ assets }: { assets: AssetAttribution[] }) {
  const [sortKey,   setSortKey]   = useState<SortKey>("allocationEffect");
  const [sortDir,   setSortDir]   = useState<"asc" | "desc">("desc");

  const sorted = [...assets].sort((a, b) => {
    const av = a[sortKey] as number | string;
    const bv = b[sortKey] as number | string;
    if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv as string) : (bv as string).localeCompare(av);
    return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
  });

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  const Th = ({ col, label, right }: { col: SortKey; label: string; right?: boolean }) => (
    <th
      onClick={() => toggleSort(col)}
      style={{
        padding: "7px 10px",
        textAlign: right ? "right" : "left",
        fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
        textTransform: "uppercase", color: sortKey === col ? BLUE : TEXT2,
        cursor: "pointer", userSelect: "none", whiteSpace: "nowrap",
        background: "#F0F4FA",
      }}
    >
      {label}{sortKey === col ? (sortDir === "desc" ? " ↓" : " ↑") : ""}
    </th>
  );

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr>
            <Th col="ticker"           label="Ticker"            />
            <th style={{ padding: "7px 10px", fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: TEXT2, background: "#F0F4FA", whiteSpace: "nowrap" }}>Company</th>
            <Th col="wp"               label="Port. W%"   right  />
            <Th col="wb"               label="Bench. W%"  right  />
            <Th col="activeWeight"     label="Active W%"  right  />
            <Th col="ret"              label="Return"     right  />
            <Th col="allocationEffect" label="Alloc. Effect" right />
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr
              key={row.ticker}
              style={{
                background: i % 2 === 0 ? "#FFFFFF" : "rgba(15,23,42,0.018)",
                borderBottom: "1px solid rgba(15,23,42,0.05)",
                transition: "background 0.1s",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(37,99,235,0.04)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = i % 2 === 0 ? "#FFFFFF" : "rgba(15,23,42,0.018)"; }}
            >
              {/* Ticker */}
              <td style={{ padding: "8px 10px", fontFamily: "JetBrains Mono, monospace", fontWeight: 700, color: BLUE, fontSize: 11, whiteSpace: "nowrap" }}>
                {row.ticker}
              </td>

              {/* Company */}
              <td style={{ padding: "8px 10px", color: TEXT1, fontSize: 11, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {row.company}
              </td>

              {/* Port. Weight */}
              <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: TEXT1 }}>
                {fmtW(row.wp)}
              </td>

              {/* Bench. Weight */}
              <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: TEXT2 }}>
                {fmtW(row.wb)}
              </td>

              {/* Active Weight */}
              <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontSize: 11, fontWeight: 700 }}>
                <span style={{
                  color: pctColor(row.activeWeight),
                  background: row.activeWeight > 0 ? "rgba(5,150,105,0.09)" : row.activeWeight < 0 ? "rgba(220,38,38,0.09)" : "transparent",
                  border: `1px solid ${row.activeWeight > 0 ? "rgba(5,150,105,0.25)" : row.activeWeight < 0 ? "rgba(220,38,38,0.25)" : "transparent"}`,
                  borderRadius: 4, padding: "2px 6px",
                }}>
                  {fmtW(row.activeWeight)}
                </span>
              </td>

              {/* Return */}
              <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontSize: 11, fontWeight: 600, color: pctColor(row.ret) }}>
                {fmtPct(row.ret)}
              </td>

              {/* Allocation Effect */}
              <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontSize: 11, fontWeight: 800 }}>
                <span style={{
                  color: pctColor(row.allocationEffect),
                  background: row.allocationEffect > 0 ? "rgba(5,150,105,0.09)" : row.allocationEffect < 0 ? "rgba(220,38,38,0.09)" : "transparent",
                  border: `1px solid ${row.allocationEffect > 0 ? "rgba(5,150,105,0.25)" : row.allocationEffect < 0 ? "rgba(220,38,38,0.25)" : "transparent"}`,
                  borderRadius: 4, padding: "2px 8px",
                }}>
                  {fmtPct(row.allocationEffect, 3)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>

        {/* Totals row */}
        <tfoot>
          <tr style={{ background: "#F0F4FA", borderTop: "2px solid rgba(15,23,42,0.10)" }}>
            <td colSpan={2} style={{ padding: "8px 10px", fontSize: 10, fontWeight: 700, color: TEXT2, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Total / Weighted Sum
            </td>
            <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontSize: 11, fontWeight: 700, color: TEXT1 }}>
              {fmtW(assets.reduce((s, r) => s + r.wp, 0))}
            </td>
            <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontSize: 11, fontWeight: 700, color: TEXT2 }}>
              {fmtW(assets.reduce((s, r) => s + r.wb, 0))}
            </td>
            <td style={{ padding: "8px 10px", textAlign: "right" }} />
            <td style={{ padding: "8px 10px", textAlign: "right" }} />
            <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontSize: 11, fontWeight: 800 }}>
              <span style={{ color: pctColor(assets.reduce((s, r) => s + r.allocationEffect, 0)) }}>
                {fmtPct(assets.reduce((s, r) => s + r.allocationEffect, 0), 3)}
              </span>
            </td>
          </tr>
        </tfoot>
      </table>

      {/* Legend */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 14px", borderTop: "1px solid rgba(15,23,42,0.06)" }}>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <span style={{ fontSize: 10, color: GREEN, fontWeight: 600 }}>● Overweight / Positive</span>
          <span style={{ fontSize: 10, color: RED,   fontWeight: 600 }}>● Underweight / Negative</span>
          <span style={{ fontSize: 10, color: TEXT2, fontStyle: "italic" }}>
            Flat Universe: Selection & Interaction = 0 (single return source)
          </span>
        </div>
        <span style={{ fontSize: 10, color: "#CBD5E1" }}>Fuente: Bloomberg</span>
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function FlatAttributionPanel() {
  const [fundName, setFundName] = useState(FUNDS[0].value);
  const [period,   setPeriod  ] = useState("retYtd");
  const [data,     setData    ] = useState<FlatAttributionPayload | null>(null);
  const [loading,  setLoading ] = useState(false);
  const [error,    setError   ] = useState<string | null>(null);

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);
    const url = `/api/attribution/flat?fundName=${encodeURIComponent(fundName)}&period=${period}`;
    fetch(url)
      .then((r) => r.json())
      .then((d: FlatAttributionPayload & { error?: string }) => {
        if (d.error) throw new Error(d.error);
        setData(d);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [fundName, period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fundInfo = FUNDS.find((f) => f.value === fundName) ?? FUNDS[0];
  const selPeriod = PERIODS.find((p) => p.value === period) ?? PERIODS[0];

  const selectStyle: React.CSSProperties = {
    padding: "6px 10px", borderRadius: 8,
    background: "#F8FAFF", border: `1px solid ${BORDER}`,
    color: TEXT1, fontSize: 12, cursor: "pointer", outline: "none",
    fontFamily: "JetBrains Mono, monospace",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── Controls bar ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {/* Fund selector */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, color: TEXT2, fontWeight: 600 }}>Fund</span>
          <select value={fundName} onChange={(e) => setFundName(e.target.value)} style={selectStyle}>
            {FUNDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>

        {/* Benchmark chip */}
        <span style={{
          fontSize: 10, fontWeight: 700, color: "#7C3AED",
          background: "rgba(124,58,237,0.08)", border: "1px solid rgba(124,58,237,0.20)",
          borderRadius: 6, padding: "3px 10px", fontFamily: "JetBrains Mono, monospace",
          letterSpacing: "0.04em",
        }}>
          vs {fundInfo.bench}
        </span>

        {/* Period selector */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, color: TEXT2, fontWeight: 600 }}>Period</span>
          <div style={{ display: "flex", gap: 2, background: "rgba(15,23,42,0.04)", border: `1px solid ${BORDER}`, borderRadius: 8, padding: 3 }}>
            {PERIODS.map((p) => {
              const active = period === p.value;
              return (
                <button
                  key={p.value}
                  onClick={() => setPeriod(p.value)}
                  style={{
                    padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                    cursor: "pointer", transition: "all 0.1s",
                    background: active ? "rgba(37,99,235,0.12)" : "transparent",
                    color:      active ? "#1E3A8A"              : TEXT2,
                    border:     active ? "1px solid rgba(37,99,235,0.28)" : "1px solid transparent",
                  }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Metadata */}
        {data && (
          <span style={{ marginLeft: "auto", fontSize: 11, color: TEXT2, fontFamily: "JetBrains Mono, monospace" }}>
            Weights: {data.summary.reportDate} · Returns: {data.summary.snapshotDate} · {data.summary.nAssets} assets
          </span>
        )}

        {/* Refresh */}
        <button
          onClick={fetchData}
          style={{ ...selectStyle, display: "flex", alignItems: "center", gap: 5 }}
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path d="M10 6A4 4 0 1 1 6 2M6 2l2-2M6 2l2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Refresh
        </button>
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "64px 0", gap: 12 }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", border: "2px solid rgba(37,99,235,0.15)", borderTopColor: BLUE, animation: "spin 0.8s linear infinite" }} />
          <span style={{ fontSize: 12, color: TEXT2, fontFamily: "JetBrains Mono, monospace" }}>
            Computing attribution for {fundInfo.label}…
          </span>
        </div>
      )}

      {/* ── Error ── */}
      {error && !loading && (
        <div style={{ background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.15)", borderRadius: 10, padding: "16px 24px", textAlign: "center" }}>
          <p style={{ color: RED, fontSize: 13, marginBottom: 8 }}>{error}</p>
          <button onClick={fetchData} style={{ ...selectStyle, color: BLUE }}>Retry</button>
        </div>
      )}

      {/* ── Content ── */}
      {data && !loading && (
        <>
          {/* ── KPI Cards ── */}
          <div style={{ display: "flex", gap: 12 }}>
            <KpiCard
              label={`Portfolio Return — ${fundInfo.label}`}
              value={fmtPct(data.summary.portReturn)}
              valueColor={pctColor(data.summary.portReturn)}
              sub={selPeriod.label}
            />
            <KpiCard
              label={`Benchmark Return — ${fundInfo.bench}`}
              value={fmtPct(data.summary.benchReturn)}
              valueColor={pctColor(data.summary.benchReturn)}
              sub={selPeriod.label}
            />
            <KpiCard
              label="Total Alpha (Rp − Rb)"
              value={fmtPct(data.summary.totalAlpha)}
              valueColor={pctColor(data.summary.totalAlpha)}
              sub={`${selPeriod.label} · ${data.summary.nAssets} assets`}
            />
          </div>

          {/* ── Methodology note ── */}
          <div style={{ ...cardStyle, padding: "10px 16px", background: "rgba(37,99,235,0.03)", borderColor: "rgba(37,99,235,0.12)" }}>
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "baseline" }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: BLUE, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Brinson-Fachler · Flat Universe
              </span>
              <span style={{ fontSize: 11, color: TEXT2 }}>
                <b style={{ color: TEXT1 }}>Allocation</b> A<sub>i</sub> = (w<sub>p</sub> − w<sub>b</sub>)(r<sub>i</sub> − R<sub>b</sub>)
              </span>
              <span style={{ fontSize: 11, color: TEXT2 }}>
                <b style={{ color: TEXT1 }}>Selection</b> = 0 &nbsp; <b style={{ color: TEXT1 }}>Interaction</b> = 0 &nbsp;
                <span style={{ fontStyle: "italic" }}>(single return source: r<sub>p,i</sub> = r<sub>b,i</sub> = r<sub>i</sub>)</span>
              </span>
              <span style={{ fontSize: 11, color: TEXT2 }}>
                <b style={{ color: TEXT1 }}>Identity:</b> Σ A<sub>i</sub> = R<sub>p</sub> − R<sub>b</sub> = {fmtPct(data.summary.totalAlpha, 3)}
              </span>
            </div>
          </div>

          {/* ── Attribution Table ── */}
          <div style={{ ...cardStyle, overflow: "hidden" }}>
            <div style={{ padding: "14px 16px 0", marginBottom: 4 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.10em", color: TEXT2, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ display: "inline-block", width: 3, height: 12, borderRadius: 2, background: BLUE }} />
                Asset-Level Attribution — {selPeriod.label}
                <span style={{ marginLeft: "auto", fontWeight: 400, textTransform: "none", letterSpacing: 0, fontSize: 11 }}>
                  Click column headers to sort
                </span>
              </div>
            </div>
            <AttributionTable assets={data.assets} />
          </div>
        </>
      )}
    </div>
  );
}
