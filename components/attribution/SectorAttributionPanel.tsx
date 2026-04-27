"use client";

import { useState, useEffect, useCallback } from "react";
import type { SectorAttributionPayload, SectorRow } from "@/app/api/attribution/sector/route";

// ── Tokens ────────────────────────────────────────────────────────────────────
const BORDER    = "rgba(15,23,42,0.08)";
const TEXT1     = "#0F172A";
const TEXT2     = "#64748B";
const GREEN     = "#059669";
const RED       = "#DC2626";
const BLUE      = "#2563EB";
const PURPLE    = "#7C3AED";
const cardStyle: React.CSSProperties = {
  background: "#FFFFFF",
  border: `1px solid ${BORDER}`,
  borderRadius: 12,
  boxShadow: "0 1px 4px rgba(15,23,42,0.06)",
};

// ── Config ────────────────────────────────────────────────────────────────────
const FUNDS = [
  { value: "Moneda_Latin_America_Equities_(LX)",  label: "LA Equities (LX)",  bench: "MXLA Index"   },
  { value: "Moneda_Latin_America_Small_Cap_(LX)", label: "LA Small Cap (LX)", bench: "MXLASC Index" },
];
const PERIODS = [
  { value: "retYtd", label: "YTD"     },
  { value: "ret1W",  label: "1 Week"  },
  { value: "ret1M",  label: "1 Month" },
  { value: "ret1Y",  label: "1 Year"  },
];

// ── Formatters ────────────────────────────────────────────────────────────────
function fmtPct(v: number, dec = 2): string {
  const p = v * 100;
  return (p >= 0 ? "+" : "") + p.toFixed(dec) + "%";
}
function fmtW(v: number): string {
  return (v * 100).toFixed(2) + "%";
}
function numColor(v: number): string {
  return v > 0 ? GREEN : v < 0 ? RED : TEXT2;
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, valueColor, sub }: {
  label: string; value: string; valueColor?: string; sub?: string;
}) {
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

// ── Effect Cell ───────────────────────────────────────────────────────────────
function EffectCell({ v, dec = 2 }: { v: number; dec?: number }) {
  const zero = Math.abs(v) < 1e-9;
  const pos  = v > 0;
  const color  = zero ? TEXT2 : pos ? GREEN : RED;
  const bg     = zero ? "transparent" : pos ? "rgba(5,150,105,0.09)"  : "rgba(220,38,38,0.09)";
  const border = zero ? "transparent" : pos ? "rgba(5,150,105,0.25)"  : "rgba(220,38,38,0.25)";
  return (
    <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontSize: 11, fontWeight: 700 }}>
      <span style={{ color, background: bg, border: `1px solid ${border}`, borderRadius: 4, padding: "2px 8px", display: "inline-block", minWidth: 64, textAlign: "right" }}>
        {fmtPct(v, dec)}
      </span>
    </td>
  );
}

// ── Sort key ──────────────────────────────────────────────────────────────────
type SortKey = keyof Pick<SectorRow, "sectorName" | "Wp" | "Wb" | "activeWeight" | "Rp" | "Rb" | "allocation" | "selection" | "interaction" | "totalAlpha">;

// ── Main panel ────────────────────────────────────────────────────────────────
export default function SectorAttributionPanel() {
  const [fundName, setFundName] = useState(FUNDS[0].value);
  const [period,   setPeriod  ] = useState("retYtd");
  const [data,     setData    ] = useState<SectorAttributionPayload | null>(null);
  const [loading,  setLoading ] = useState(false);
  const [error,    setError   ] = useState<string | null>(null);
  const [sortKey,  setSortKey ] = useState<SortKey>("totalAlpha");
  const [sortDir,  setSortDir ] = useState<"asc" | "desc">("desc");

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/attribution/sector?fundName=${encodeURIComponent(fundName)}&period=${period}`)
      .then((r) => r.json())
      .then((d: SectorAttributionPayload & { error?: string }) => {
        if (d.error) throw new Error(d.error);
        setData(d);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [fundName, period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fundInfo  = FUNDS.find((f) => f.value === fundName) ?? FUNDS[0];
  const selPeriod = PERIODS.find((p) => p.value === period) ?? PERIODS[0];

  // Sort sectors
  const sorted = data
    ? [...data.sectors].sort((a, b) => {
        const av = a[sortKey] as number | string;
        const bv = b[sortKey] as number | string;
        if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv as string) : (bv as string).localeCompare(av);
        return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
      })
    : [];

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  const selectStyle: React.CSSProperties = {
    padding: "6px 10px", borderRadius: 8,
    background: "#F8FAFF", border: `1px solid ${BORDER}`,
    color: TEXT1, fontSize: 12, cursor: "pointer", outline: "none",
    fontFamily: "JetBrains Mono, monospace",
  };

  const Th = ({ col, label, right }: { col: SortKey; label: string; right?: boolean }) => (
    <th
      onClick={() => toggleSort(col)}
      style={{
        padding: "7px 10px", textAlign: right ? "right" : "left",
        fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: sortKey === col ? BLUE : TEXT2,
        cursor: "pointer", userSelect: "none", whiteSpace: "nowrap",
        background: "#F0F4FA",
        borderBottom: "1px solid rgba(15,23,42,0.08)",
      }}
    >
      {label}{sortKey === col ? (sortDir === "desc" ? " ↓" : " ↑") : ""}
    </th>
  );

  // ── Totals for tfoot ──────────────────────────────────────────────────────
  const totals = data?.sectors.reduce(
    (acc, s) => ({
      Wp:          acc.Wp + s.Wp,
      Wb:          acc.Wb + s.Wb,
      allocation:  acc.allocation  + s.allocation,
      selection:   acc.selection   + s.selection,
      interaction: acc.interaction + s.interaction,
      totalAlpha:  acc.totalAlpha  + s.totalAlpha,
    }),
    { Wp: 0, Wb: 0, allocation: 0, selection: 0, interaction: 0, totalAlpha: 0 }
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── Controls ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, color: TEXT2, fontWeight: 600 }}>Fund</span>
          <select value={fundName} onChange={(e) => setFundName(e.target.value)} style={selectStyle}>
            {FUNDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>

        <span style={{
          fontSize: 10, fontWeight: 700, color: PURPLE,
          background: "rgba(124,58,237,0.08)", border: "1px solid rgba(124,58,237,0.20)",
          borderRadius: 6, padding: "3px 10px", fontFamily: "JetBrains Mono, monospace",
        }}>
          vs {fundInfo.bench}
        </span>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, color: TEXT2, fontWeight: 600 }}>Period</span>
          <div style={{ display: "flex", gap: 2, background: "rgba(15,23,42,0.04)", border: `1px solid ${BORDER}`, borderRadius: 8, padding: 3 }}>
            {PERIODS.map((p) => {
              const active = period === p.value;
              return (
                <button key={p.value} onClick={() => setPeriod(p.value)} style={{
                  padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                  cursor: "pointer", transition: "all 0.1s",
                  background: active ? "rgba(37,99,235,0.12)" : "transparent",
                  color:      active ? "#1E3A8A" : TEXT2,
                  border:     active ? "1px solid rgba(37,99,235,0.28)" : "1px solid transparent",
                }}>
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        {data && (
          <span style={{ marginLeft: "auto", fontSize: 11, color: TEXT2, fontFamily: "JetBrains Mono, monospace" }}>
            Weights: {data.summary.reportDate} · Returns: {data.summary.snapshotDate} · {data.summary.nAssets} assets · {data.sectors.length} sectors
          </span>
        )}

        <button onClick={fetchData} style={{ ...selectStyle, display: "flex", alignItems: "center", gap: 5 }}>
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
            Computing sector attribution for {fundInfo.label}…
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
          {/* KPI Cards */}
          <div style={{ display: "flex", gap: 12 }}>
            <KpiCard
              label={`Portfolio Return — ${fundInfo.label}`}
              value={fmtPct(data.summary.portReturn)}
              valueColor={numColor(data.summary.portReturn)}
              sub={selPeriod.label}
            />
            <KpiCard
              label={`Benchmark Return — ${fundInfo.bench}`}
              value={fmtPct(data.summary.benchReturn)}
              valueColor={numColor(data.summary.benchReturn)}
              sub={selPeriod.label}
            />
            <KpiCard
              label="Total Alpha (Rp − Rb)"
              value={fmtPct(data.summary.totalAlpha)}
              valueColor={numColor(data.summary.totalAlpha)}
              sub={`${selPeriod.label} · ${data.summary.nAssets} assets · ${data.sectors.length} sectors`}
            />
          </div>

          {/* Methodology banner */}
          <div style={{ ...cardStyle, padding: "10px 16px", background: "rgba(37,99,235,0.03)", borderColor: "rgba(37,99,235,0.12)" }}>
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "baseline" }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: BLUE, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Brinson-Fachler · Sector Multi-Layer
              </span>
              <span style={{ fontSize: 11, color: TEXT2 }}>
                <b style={{ color: TEXT1 }}>Allocation</b> A<sub>j</sub> = (W<sub>p</sub> − W<sub>b</sub>)(R<sub>b,j</sub> − R<sub>b</sub>)
              </span>
              <span style={{ fontSize: 11, color: TEXT2 }}>
                <b style={{ color: TEXT1 }}>Selection</b> S<sub>j</sub> = W<sub>b,j</sub> · (R<sub>p,j</sub> − R<sub>b,j</sub>)
              </span>
              <span style={{ fontSize: 11, color: TEXT2 }}>
                <b style={{ color: TEXT1 }}>Interaction</b> I<sub>j</sub> = (W<sub>p</sub> − W<sub>b</sub>)(R<sub>p,j</sub> − R<sub>b,j</sub>)
              </span>
              <span style={{ fontSize: 11, color: TEXT2 }}>
                <b style={{ color: TEXT1 }}>Identity:</b> Σ(A+S+I) = R<sub>p</sub> − R<sub>b</sub> =&nbsp;
                <span style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 700, color: numColor(data.summary.totalAlpha) }}>
                  {fmtPct(data.summary.totalAlpha, 3)}
                </span>
              </span>
            </div>
          </div>

          {/* Sector table */}
          <div style={{ ...cardStyle, overflow: "hidden" }}>
            <div style={{ padding: "14px 16px 0", marginBottom: 4, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.10em", color: TEXT2, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ display: "inline-block", width: 3, height: 12, borderRadius: 2, background: BLUE }} />
                Sector Attribution — {selPeriod.label}
              </div>
              <span style={{ fontSize: 11, color: TEXT2 }}>Click column headers to sort</span>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  {/* Group row */}
                  <tr>
                    <th colSpan={3} style={{ padding: "5px 10px", background: "#F0F4FA", fontSize: 9, fontWeight: 700, color: TEXT2, letterSpacing: "0.08em", textTransform: "uppercase", textAlign: "left", borderBottom: "1px solid rgba(15,23,42,0.08)" }} />
                    <th colSpan={2} style={{ padding: "5px 10px", background: "rgba(37,99,235,0.06)", fontSize: 9, fontWeight: 800, color: BLUE, letterSpacing: "0.08em", textTransform: "uppercase", textAlign: "center", borderBottom: "2px solid rgba(37,99,235,0.20)", borderLeft: "1px solid rgba(15,23,42,0.07)" }}>
                      Sector Return
                    </th>
                    <th colSpan={3} style={{ padding: "5px 10px", background: "rgba(16,185,129,0.06)", fontSize: 9, fontWeight: 800, color: GREEN, letterSpacing: "0.08em", textTransform: "uppercase", textAlign: "center", borderBottom: "2px solid rgba(16,185,129,0.20)", borderLeft: "1px solid rgba(15,23,42,0.07)" }}>
                      Attribution Effects
                    </th>
                    <th style={{ padding: "5px 10px", background: "#F0F4FA", fontSize: 9, fontWeight: 800, color: TEXT1, letterSpacing: "0.08em", textTransform: "uppercase", textAlign: "center", borderBottom: "1px solid rgba(15,23,42,0.08)", borderLeft: "1px solid rgba(15,23,42,0.07)" }}>
                      Total
                    </th>
                  </tr>
                  <tr>
                    <Th col="sectorName"   label="Sector (GICS)"         />
                    <Th col="Wp"           label="Port. W%"      right   />
                    <Th col="Wb"           label="Bench. W%"     right   />
                    <Th col="Rp"           label="Port. Ret"     right   />
                    <Th col="Rb"           label="Bench. Ret"    right   />
                    <Th col="allocation"   label="Allocation"    right   />
                    <Th col="selection"    label="Selection"     right   />
                    <Th col="interaction"  label="Interaction"   right   />
                    <Th col="totalAlpha"   label="Total Alpha"   right   />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((s, i) => (
                    <tr
                      key={s.sectorName}
                      style={{
                        background: i % 2 === 0 ? "#FFFFFF" : "rgba(15,23,42,0.018)",
                        borderBottom: "1px solid rgba(15,23,42,0.05)",
                        transition: "background 0.1s",
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(37,99,235,0.04)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = i % 2 === 0 ? "#FFFFFF" : "rgba(15,23,42,0.018)"; }}
                    >
                      {/* Sector */}
                      <td style={{ padding: "9px 10px", fontWeight: 700, color: TEXT1, fontSize: 12, whiteSpace: "nowrap" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {s.sectorName}
                          <span style={{ fontSize: 9, color: TEXT2, background: "rgba(15,23,42,0.05)", borderRadius: 4, padding: "1px 5px", fontFamily: "JetBrains Mono, monospace" }}>
                            {s.nAssets}
                          </span>
                        </div>
                      </td>
                      {/* Port. Weight */}
                      <td style={{ padding: "9px 10px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: TEXT1 }}>
                        {fmtW(s.Wp)}
                      </td>
                      {/* Bench. Weight */}
                      <td style={{ padding: "9px 10px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: TEXT2 }}>
                        {fmtW(s.Wb)}
                      </td>
                      {/* Port. Return */}
                      <td style={{ padding: "9px 10px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontSize: 11, fontWeight: 600, color: numColor(s.Rp), borderLeft: "1px solid rgba(15,23,42,0.05)" }}>
                        {fmtPct(s.Rp)}
                      </td>
                      {/* Bench. Return */}
                      <td style={{ padding: "9px 10px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: numColor(s.Rb) }}>
                        {fmtPct(s.Rb)}
                      </td>
                      {/* Effects */}
                      <EffectCell v={s.allocation}  />
                      <EffectCell v={s.selection}   />
                      <EffectCell v={s.interaction} />
                      {/* Total Alpha — highlighted */}
                      <EffectCell v={s.totalAlpha} dec={3} />
                    </tr>
                  ))}
                </tbody>

                {/* ── Totals footer ── */}
                {totals && (
                  <tfoot>
                    <tr style={{ background: "#F0F4FA", borderTop: "2px solid rgba(15,23,42,0.12)" }}>
                      <td style={{ padding: "8px 10px", fontSize: 10, fontWeight: 700, color: TEXT2, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                        Σ Total
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontSize: 11, fontWeight: 700, color: TEXT1 }}>
                        {fmtW(totals.Wp)}
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontSize: 11, fontWeight: 700, color: TEXT2 }}>
                        {fmtW(totals.Wb)}
                      </td>
                      {/* Rp / Rb cells empty — weighted avg of sector returns ≠ global */}
                      <td colSpan={2} style={{ padding: "8px 10px", textAlign: "center", fontSize: 10, color: TEXT2, fontStyle: "italic" }}>
                        weighted
                      </td>
                      {/* Effect totals */}
                      {([totals.allocation, totals.selection, totals.interaction] as number[]).map((v, idx) => (
                        <td key={idx} style={{ padding: "8px 10px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontSize: 11, fontWeight: 800, color: numColor(v) }}>
                          {fmtPct(v, 3)}
                        </td>
                      ))}
                      {/* Total alpha — should equal summary.totalAlpha */}
                      <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontSize: 12, fontWeight: 800 }}>
                        <span style={{
                          color: numColor(totals.totalAlpha),
                          background: totals.totalAlpha > 0 ? "rgba(5,150,105,0.12)" : "rgba(220,38,38,0.12)",
                          border: `1px solid ${totals.totalAlpha > 0 ? "rgba(5,150,105,0.30)" : "rgba(220,38,38,0.30)"}`,
                          borderRadius: 5, padding: "3px 10px",
                        }}>
                          {fmtPct(totals.totalAlpha, 3)}
                        </span>
                      </td>
                    </tr>
                    {/* Reconciliation check */}
                    <tr style={{ background: "#F8FAFC" }}>
                      <td colSpan={9} style={{ padding: "5px 10px", fontSize: 10, color: TEXT2, fontStyle: "italic" }}>
                        Reconciliation: Σ Total Alpha ({fmtPct(totals.totalAlpha, 3)}) should equal global alpha R<sub>p</sub> − R<sub>b</sub> ({fmtPct(data.summary.totalAlpha, 3)}).
                        &nbsp;Δ = {fmtPct(totals.totalAlpha - data.summary.totalAlpha, 4)}
                        &nbsp;·&nbsp;Fuente: Bloomberg
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* Legend */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 14px", borderTop: "1px solid rgba(15,23,42,0.06)" }}>
              <div style={{ display: "flex", gap: 16 }}>
                <span style={{ fontSize: 10, color: GREEN, fontWeight: 600 }}>● Positive contribution</span>
                <span style={{ fontSize: 10, color: RED,   fontWeight: 600 }}>● Negative contribution</span>
                <span style={{ fontSize: 10, color: TEXT2 }}>N = # assets in sector</span>
              </div>
              <span style={{ fontSize: 10, color: "#CBD5E1" }}>Brinson-Fachler · Grouped by GICS industry</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
