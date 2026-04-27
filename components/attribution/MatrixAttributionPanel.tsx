"use client";

import { useState, useEffect, useCallback } from "react";
import type { MatrixPayload, MatrixSector } from "@/app/api/attribution/matrix/route";

// ── Tokens ────────────────────────────────────────────────────────────────────
const BORDER = "rgba(15,23,42,0.08)";
const TEXT1  = "#0F172A";
const TEXT2  = "#64748B";
const GREEN  = "#059669";
const RED    = "#DC2626";
const BLUE   = "#2563EB";
const PURPLE = "#7C3AED";
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

// ── Effect Cell (with heatmap support) ────────────────────────────────────────
function EffectCell({ v, maxAbs, heatmap, dec = 2 }: {
  v: number; maxAbs?: number; heatmap?: boolean; dec?: number;
}) {
  const zero  = Math.abs(v) < 1e-9;
  const pos   = v > 0;
  const color = zero ? TEXT2 : pos ? GREEN : RED;

  let bg     = zero ? "transparent" : pos ? "rgba(5,150,105,0.09)"  : "rgba(220,38,38,0.09)";
  let border = zero ? "transparent" : pos ? "rgba(5,150,105,0.25)"  : "rgba(220,38,38,0.25)";

  if (heatmap && maxAbs && maxAbs > 0 && !zero) {
    const intensity = Math.min(Math.abs(v) / maxAbs, 1);
    if (pos) {
      bg     = `rgba(5,150,105,${(intensity * 0.35).toFixed(3)})`;
      border = `rgba(5,150,105,${(intensity * 0.50).toFixed(3)})`;
    } else {
      bg     = `rgba(220,38,38,${(intensity * 0.35).toFixed(3)})`;
      border = `rgba(220,38,38,${(intensity * 0.50).toFixed(3)})`;
    }
  }

  return (
    <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontSize: 11, fontWeight: 700 }}>
      <span style={{ color, background: bg, border: `1px solid ${border}`, borderRadius: 4, padding: "2px 8px", display: "inline-block", minWidth: 64, textAlign: "right" }}>
        {fmtPct(v, dec)}
      </span>
    </td>
  );
}

// ── Sort key ──────────────────────────────────────────────────────────────────
type SortKey = "sectorName" | "Wp" | "Wb" | "activeWeight" | "Rp" | "Rb" | "allocation" | "selection" | "interaction" | "totalAlpha";

// ── Expandable Sector Row ─────────────────────────────────────────────────────
// Asset rows are real <tr> elements inside the outer <tbody> so every column
// inherits the same width as the sector header — no nested table misalignment.
// Animation is driven by max-height on a <div> inside each <td>.
function SectorRow({
  sector, maxAbs, expanded, onToggle,
}: {
  sector: MatrixSector;
  maxAbs: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const rowBg     = "rgba(241,245,249,0.7)";
  const assetBg   = "#FAFCFF";
  const assetHover= "rgba(37,99,235,0.03)";

  // ── Per-sector asset totals (corroboration) ───────────────────────────────
  const sumWp        = sector.assets.reduce((s, a) => s + a.wp,              0);
  const sumWb        = sector.assets.reduce((s, a) => s + a.wb,              0);
  const sumSelContrib= sector.assets.reduce((s, a) => s + a.selectionContrib, 0);
  const wgtRetP      = sumWp > 0 ? sector.assets.reduce((s, a) => s + a.wp * a.ret, 0) / sumWp : 0;
  const wgtRetB      = sumWb > 0 ? sector.assets.reduce((s, a) => s + a.wb * a.ret, 0) / sumWb : 0;

  // ✓ check helpers — green tick if computed ≈ reference, amber delta otherwise
  const chk = (computed: number, ref: number, fmt: (v: number) => string) => {
    const ok = Math.abs(computed - ref) < 5e-5;
    return ok
      ? <span style={{ color: GREEN, fontWeight: 800, marginLeft: 4 }}>✓</span>
      : <span style={{ color: "#D97706", fontSize: 9, marginLeft: 4 }}>Δ{fmt(computed - ref)}</span>;
  };
  // Each animated div clips to one row height when open
  const cellDiv = (content: React.ReactNode, tdStyle?: React.CSSProperties): React.ReactNode => (
    <td style={{ padding: 0, ...tdStyle }}>
      <div style={{
        maxHeight: expanded ? "40px" : "0px",
        overflow: "hidden",
        transition: "max-height 0.26s ease",
      }}>
        {content}
      </div>
    </td>
  );

  return (
    <>
      {/* ── Sector header row ── */}
      <tr
        style={{
          background: rowBg,
          borderBottom: "1px solid rgba(15,23,42,0.06)",
          cursor: "pointer",
          transition: "background 0.1s",
        }}
        onClick={onToggle}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(37,99,235,0.06)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = rowBg; }}
      >
        {/* Col 1 — expand toggle + sector name */}
        <td style={{ padding: "9px 10px", fontWeight: 700, color: TEXT1, fontSize: 12, whiteSpace: "nowrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 16, height: 16, borderRadius: 4, fontSize: 10, fontWeight: 800,
              background: expanded ? "rgba(37,99,235,0.12)" : "rgba(15,23,42,0.06)",
              color: expanded ? BLUE : TEXT2,
              border: `1px solid ${expanded ? "rgba(37,99,235,0.25)" : "rgba(15,23,42,0.10)"}`,
              transition: "all 0.15s", flexShrink: 0,
            }}>
              {expanded ? "−" : "+"}
            </span>
            {sector.sectorName}
            <span style={{
              fontSize: 9, color: TEXT2, background: "rgba(15,23,42,0.05)",
              borderRadius: 4, padding: "1px 5px", fontFamily: "JetBrains Mono, monospace",
            }}>
              {sector.nAssets}
            </span>
          </div>
        </td>
        {/* Col 2 — Port. W% */}
        <td style={{ padding: "9px 10px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: TEXT1, fontWeight: 600 }}>
          {fmtW(sector.Wp)}
        </td>
        {/* Col 3 — Bench. W% */}
        <td style={{ padding: "9px 10px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: TEXT2 }}>
          {fmtW(sector.Wb)}
        </td>
        {/* Col 4 — Active W% */}
        <td style={{ padding: "9px 10px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontSize: 11, fontWeight: 600, color: numColor(sector.activeWeight), borderLeft: "1px solid rgba(15,23,42,0.05)" }}>
          {fmtPct(sector.activeWeight)}
        </td>
        {/* Col 5 — Port. Ret */}
        <td style={{ padding: "9px 10px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontSize: 11, fontWeight: 600, color: numColor(sector.Rp), borderLeft: "1px solid rgba(15,23,42,0.05)" }}>
          {fmtPct(sector.Rp)}
        </td>
        {/* Col 6 — Bench. Ret */}
        <td style={{ padding: "9px 10px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: numColor(sector.Rb) }}>
          {fmtPct(sector.Rb)}
        </td>
        {/* Cols 7-9 — Effects */}
        <EffectCell v={sector.allocation}  />
        <EffectCell v={sector.selection}   />
        <EffectCell v={sector.interaction} />
        {/* Col 10 — Total Alpha (heatmap) */}
        <EffectCell v={sector.totalAlpha} maxAbs={maxAbs} heatmap dec={3} />
      </tr>

      {/* ── Asset drill-down rows — one real <tr> per asset ── */}
      {sector.assets.map((asset, ai) => (
        <tr
          key={asset.ticker}
          style={{ background: assetBg }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = assetHover; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = assetBg; }}
        >
          {/* Col 1 — Ticker + Company (indented) */}
          {cellDiv(
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px 7px 36px", whiteSpace: "nowrap",
              borderBottom: ai < sector.assets.length - 1 ? "1px solid rgba(15,23,42,0.04)" : "none" }}>
              <span style={{
                fontSize: 10, fontWeight: 700, fontFamily: "JetBrains Mono, monospace",
                color: BLUE, background: "rgba(37,99,235,0.07)",
                border: "1px solid rgba(37,99,235,0.18)", borderRadius: 4, padding: "1px 6px",
              }}>
                {asset.ticker}
              </span>
              <span style={{ fontSize: 11, color: TEXT1, fontWeight: 500 }}>{asset.company}</span>
            </div>
          )}

          {/* Col 2 — Port. W% */}
          {cellDiv(
            <div style={{ padding: "7px 10px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: TEXT1,
              borderBottom: ai < sector.assets.length - 1 ? "1px solid rgba(15,23,42,0.04)" : "none" }}>
              {fmtW(asset.wp)}
            </div>
          )}

          {/* Col 3 — Bench. W% */}
          {cellDiv(
            <div style={{ padding: "7px 10px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: TEXT2,
              borderBottom: ai < sector.assets.length - 1 ? "1px solid rgba(15,23,42,0.04)" : "none" }}>
              {fmtW(asset.wb)}
            </div>
          )}

          {/* Col 4 — Active W% */}
          {cellDiv(
            <div style={{ padding: "7px 10px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontSize: 11,
              fontWeight: 600, color: numColor(asset.wp - asset.wb),
              borderLeft: "1px solid rgba(15,23,42,0.04)",
              borderBottom: ai < sector.assets.length - 1 ? "1px solid rgba(15,23,42,0.04)" : "none" }}>
              {fmtPct(asset.wp - asset.wb)}
            </div>
          )}

          {/* Col 5 — Return (under Port. Ret) */}
          {cellDiv(
            <div style={{ padding: "7px 10px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontSize: 11,
              fontWeight: 600, color: numColor(asset.ret),
              borderLeft: "1px solid rgba(15,23,42,0.04)",
              borderBottom: ai < sector.assets.length - 1 ? "1px solid rgba(15,23,42,0.04)" : "none" }}>
              {fmtPct(asset.ret)}
            </div>
          )}

          {/* Col 6 — Bench. Ret (n/a per asset) */}
          {cellDiv(<div style={{ padding: "7px 10px",
            borderBottom: ai < sector.assets.length - 1 ? "1px solid rgba(15,23,42,0.04)" : "none" }} />)}

          {/* Col 7 — Allocation (n/a per asset) */}
          {cellDiv(<div style={{ padding: "7px 10px",
            borderBottom: ai < sector.assets.length - 1 ? "1px solid rgba(15,23,42,0.04)" : "none" }} />)}

          {/* Col 8 — Selection (n/a per asset) */}
          {cellDiv(<div style={{ padding: "7px 10px",
            borderBottom: ai < sector.assets.length - 1 ? "1px solid rgba(15,23,42,0.04)" : "none" }} />)}

          {/* Col 9 — Interaction (n/a per asset) */}
          {cellDiv(<div style={{ padding: "7px 10px",
            borderBottom: ai < sector.assets.length - 1 ? "1px solid rgba(15,23,42,0.04)" : "none" }} />)}

          {/* Col 10 — Selection Contribution (under Total α) */}
          {cellDiv(
            <div style={{ padding: "7px 10px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontSize: 11, fontWeight: 700,
              borderBottom: ai < sector.assets.length - 1 ? "1px solid rgba(15,23,42,0.04)" : "none" }}>
              <span style={{
                color: numColor(asset.selectionContrib),
                background: asset.selectionContrib > 0 ? "rgba(5,150,105,0.09)" : asset.selectionContrib < 0 ? "rgba(220,38,38,0.09)" : "transparent",
                border: `1px solid ${asset.selectionContrib > 0 ? "rgba(5,150,105,0.22)" : asset.selectionContrib < 0 ? "rgba(220,38,38,0.22)" : "transparent"}`,
                borderRadius: 4, padding: "2px 8px", display: "inline-block", minWidth: 64, textAlign: "right",
              }}>
                {fmtPct(asset.selectionContrib, 3)}
              </span>
            </div>
          )}
        </tr>
      ))}

      {/* ── Totals / reconciliation row ── */}
      <tr style={{ background: "rgba(226,232,240,0.70)" }}>
        {/* Col 1 — label */}
        {cellDiv(
          <div style={{ padding: "6px 10px 6px 36px", fontSize: 10, fontWeight: 800, color: TEXT2,
            letterSpacing: "0.07em", textTransform: "uppercase",
            borderTop: "1px solid rgba(15,23,42,0.12)" }}>
            Σ Totales
          </div>
        )}
        {/* Col 2 — Σ Port. W% (= sector.Wp) */}
        {cellDiv(
          <div style={{ padding: "6px 10px", textAlign: "right", fontFamily: "JetBrains Mono, monospace",
            fontSize: 11, fontWeight: 700, color: TEXT1,
            borderTop: "1px solid rgba(15,23,42,0.12)", display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
            {fmtW(sumWp)}{chk(sumWp, sector.Wp, fmtW)}
          </div>
        )}
        {/* Col 3 — Σ Bench. W% (= sector.Wb) */}
        {cellDiv(
          <div style={{ padding: "6px 10px", textAlign: "right", fontFamily: "JetBrains Mono, monospace",
            fontSize: 11, fontWeight: 700, color: TEXT2,
            borderTop: "1px solid rgba(15,23,42,0.12)", display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
            {fmtW(sumWb)}{chk(sumWb, sector.Wb, fmtW)}
          </div>
        )}
        {/* Col 4 — Active W% (= sector.activeWeight) */}
        {cellDiv(
          <div style={{ padding: "6px 10px", textAlign: "right", fontFamily: "JetBrains Mono, monospace",
            fontSize: 11, fontWeight: 700, color: numColor(sumWp - sumWb),
            borderTop: "1px solid rgba(15,23,42,0.12)", borderLeft: "1px solid rgba(15,23,42,0.08)",
            display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
            {fmtPct(sumWp - sumWb)}{chk(sumWp - sumWb, sector.activeWeight, fmtPct)}
          </div>
        )}
        {/* Col 5 — Wgt. avg. Port. Ret (= sector.Rp) */}
        {cellDiv(
          <div style={{ padding: "6px 10px", textAlign: "right", fontFamily: "JetBrains Mono, monospace",
            fontSize: 11, fontWeight: 700, color: numColor(wgtRetP),
            borderTop: "1px solid rgba(15,23,42,0.12)", borderLeft: "1px solid rgba(15,23,42,0.08)",
            display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
            {fmtPct(wgtRetP)}{chk(wgtRetP, sector.Rp, fmtPct)}
          </div>
        )}
        {/* Col 6 — Wgt. avg. Bench. Ret (= sector.Rb) */}
        {cellDiv(
          <div style={{ padding: "6px 10px", textAlign: "right", fontFamily: "JetBrains Mono, monospace",
            fontSize: 11, fontWeight: 700, color: numColor(wgtRetB),
            borderTop: "1px solid rgba(15,23,42,0.12)",
            display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
            {fmtPct(wgtRetB)}{chk(wgtRetB, sector.Rb, fmtPct)}
          </div>
        )}
        {/* Cols 7-9 — Allocation / Selection / Interaction (sector-level, shown above) */}
        {cellDiv(<div style={{ borderTop: "1px solid rgba(15,23,42,0.12)" }} />)}
        {cellDiv(<div style={{ borderTop: "1px solid rgba(15,23,42,0.12)" }} />)}
        {cellDiv(<div style={{ borderTop: "1px solid rgba(15,23,42,0.12)" }} />)}
        {/* Col 10 — Σ selectionContrib ≈ 0 by construction */}
        {cellDiv(
          <div style={{ padding: "6px 10px", textAlign: "right", fontFamily: "JetBrains Mono, monospace",
            fontSize: 11, fontWeight: 700,
            borderTop: "1px solid rgba(15,23,42,0.12)", display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
            <span style={{
              color: Math.abs(sumSelContrib) < 5e-5 ? TEXT2 : numColor(sumSelContrib),
              background: "rgba(15,23,42,0.05)", border: "1px solid rgba(15,23,42,0.10)",
              borderRadius: 4, padding: "2px 8px", display: "inline-block", minWidth: 64, textAlign: "right",
            }}>
              {fmtPct(sumSelContrib, 3)}
            </span>
            {chk(sumSelContrib, 0, (v) => fmtPct(v, 4))}
          </div>
        )}
      </tr>

      {/* Separator after totals row when expanded */}
      {expanded && (
        <tr><td colSpan={10} style={{ padding: 0, borderBottom: "2px solid rgba(37,99,235,0.10)" }} /></tr>
      )}
    </>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────
export default function MatrixAttributionPanel() {
  const [fundName,   setFundName  ] = useState(FUNDS[0].value);
  const [period,     setPeriod    ] = useState("retYtd");
  const [data,       setData      ] = useState<MatrixPayload | null>(null);
  const [loading,    setLoading   ] = useState(false);
  const [error,      setError     ] = useState<string | null>(null);
  const [sortKey,    setSortKey   ] = useState<SortKey>("totalAlpha");
  const [sortDir,    setSortDir   ] = useState<"asc" | "desc">("desc");
  const [expanded,   setExpanded  ] = useState<Set<string>>(new Set());

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);
    setExpanded(new Set());
    fetch(`/api/attribution/matrix?fundName=${encodeURIComponent(fundName)}&period=${period}`)
      .then((r) => r.json())
      .then((d: MatrixPayload & { error?: string }) => {
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
        const av = a[sortKey as keyof MatrixSector] as number | string;
        const bv = b[sortKey as keyof MatrixSector] as number | string;
        if (typeof av === "string") {
          return sortDir === "asc" ? av.localeCompare(bv as string) : (bv as string).localeCompare(av);
        }
        return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
      })
    : [];

  // Max |totalAlpha| for heatmap scaling
  const maxAbs = data
    ? Math.max(...data.sectors.map((s) => Math.abs(s.totalAlpha)), 1e-9)
    : 1e-9;

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  function toggleExpand(sectorName: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(sectorName)) next.delete(sectorName);
      else next.add(sectorName);
      return next;
    });
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
        fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
        color: sortKey === col ? BLUE : TEXT2,
        cursor: "pointer", userSelect: "none", whiteSpace: "nowrap",
        background: "#F0F4FA", borderBottom: "1px solid rgba(15,23,42,0.08)",
      }}
    >
      {label}{sortKey === col ? (sortDir === "desc" ? " ↓" : " ↑") : ""}
    </th>
  );

  // Totals
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
            Weights: {data.summary.reportDate} · Returns: {data.summary.snapshotDate} · {data.summary.nAssets} assets · {data.summary.nSectors} sectors
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
            Building attribution matrix for {fundInfo.label}…
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
              sub={`${selPeriod.label} · ${data.summary.nAssets} assets · ${data.summary.nSectors} sectors`}
            />
          </div>

          {/* Methodology banner */}
          <div style={{ ...cardStyle, padding: "10px 16px", background: "rgba(37,99,235,0.03)", borderColor: "rgba(37,99,235,0.12)" }}>
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "baseline" }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: BLUE, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Brinson-Fachler · Attribution Matrix
              </span>
              <span style={{ fontSize: 11, color: TEXT2 }}>
                Click a <b style={{ color: TEXT1 }}>sector row</b> to expand its asset drill-down
              </span>
              <span style={{ fontSize: 11, color: TEXT2 }}>
                <b style={{ color: TEXT1 }}>Asset contrib.</b> c<sub>i</sub> = w<sub>b,i</sub> · (r<sub>i</sub> − R<sub>b,j</sub>)
              </span>
              <span style={{ fontSize: 11, color: TEXT2 }}>
                <b style={{ color: TEXT1 }}>Total Alpha heatmap</b> — cell intensity scales with magnitude
              </span>
            </div>
          </div>

          {/* Matrix table */}
          <div style={{ ...cardStyle, overflow: "hidden" }}>
            <div style={{ padding: "14px 16px 0", marginBottom: 4, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.10em", color: TEXT2, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ display: "inline-block", width: 3, height: 12, borderRadius: 2, background: BLUE }} />
                Attribution Matrix — {selPeriod.label}
              </div>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <button
                  onClick={() => {
                    const allNames = new Set(data.sectors.map((s) => s.sectorName));
                    setExpanded((prev) => prev.size === allNames.size ? new Set() : allNames);
                  }}
                  style={{ ...selectStyle, fontSize: 11, padding: "4px 10px" }}
                >
                  {expanded.size === data.sectors.length ? "Collapse all" : "Expand all"}
                </button>
                <span style={{ fontSize: 11, color: TEXT2 }}>Click headers to sort · Click sector row to expand</span>
              </div>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  {/* Group row */}
                  <tr>
                    <th colSpan={4} style={{ padding: "5px 10px", background: "#F0F4FA", fontSize: 9, fontWeight: 700, color: TEXT2, letterSpacing: "0.08em", textTransform: "uppercase", textAlign: "left", borderBottom: "1px solid rgba(15,23,42,0.08)" }} />
                    <th colSpan={2} style={{ padding: "5px 10px", background: "rgba(37,99,235,0.06)", fontSize: 9, fontWeight: 800, color: BLUE, letterSpacing: "0.08em", textTransform: "uppercase", textAlign: "center", borderBottom: "2px solid rgba(37,99,235,0.20)", borderLeft: "1px solid rgba(15,23,42,0.07)" }}>
                      Sector Return
                    </th>
                    <th colSpan={3} style={{ padding: "5px 10px", background: "rgba(16,185,129,0.06)", fontSize: 9, fontWeight: 800, color: GREEN, letterSpacing: "0.08em", textTransform: "uppercase", textAlign: "center", borderBottom: "2px solid rgba(16,185,129,0.20)", borderLeft: "1px solid rgba(15,23,42,0.07)" }}>
                      Attribution Effects
                    </th>
                    <th style={{ padding: "5px 10px", background: "#F0F4FA", fontSize: 9, fontWeight: 800, color: TEXT1, letterSpacing: "0.08em", textTransform: "uppercase", textAlign: "center", borderBottom: "1px solid rgba(15,23,42,0.08)", borderLeft: "1px solid rgba(15,23,42,0.07)" }}>
                      Total / Asset Contrib.
                    </th>
                  </tr>
                  <tr>
                    <Th col="sectorName"   label="Sector (GICS)"         />
                    <Th col="Wp"           label="Port. W%"      right   />
                    <Th col="Wb"           label="Bench. W%"     right   />
                    <Th col="activeWeight" label="Active W%"     right   />
                    <Th col="Rp"           label="Port. Ret"     right   />
                    <Th col="Rb"           label="Bench. Ret"    right   />
                    <Th col="allocation"   label="Allocation"    right   />
                    <Th col="selection"    label="Selection"     right   />
                    <Th col="interaction"  label="Interaction"   right   />
                    <Th col="totalAlpha"   label="Total α / Contrib." right />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((sector) => (
                    <SectorRow
                      key={sector.sectorName}
                      sector={sector}
                      maxAbs={maxAbs}
                      expanded={expanded.has(sector.sectorName)}
                      onToggle={() => toggleExpand(sector.sectorName)}
                    />
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
                      <td style={{ padding: "8px 10px", textAlign: "center", fontSize: 10, color: TEXT2 }}>—</td>
                      <td colSpan={2} style={{ padding: "8px 10px", textAlign: "center", fontSize: 10, color: TEXT2, fontStyle: "italic" }}>
                        weighted
                      </td>
                      {([totals.allocation, totals.selection, totals.interaction] as number[]).map((v, idx) => (
                        <td key={idx} style={{ padding: "8px 10px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontSize: 11, fontWeight: 800, color: numColor(v) }}>
                          {fmtPct(v, 3)}
                        </td>
                      ))}
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
                    <tr style={{ background: "#F8FAFC" }}>
                      <td colSpan={10} style={{ padding: "5px 10px", fontSize: 10, color: TEXT2, fontStyle: "italic" }}>
                        Reconciliation: Σ Total Alpha ({fmtPct(totals.totalAlpha, 3)}) should equal R<sub>p</sub> − R<sub>b</sub> ({fmtPct(data.summary.totalAlpha, 3)}).
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
                <span style={{ fontSize: 10, color: GREEN, fontWeight: 600 }}>● Positive alpha</span>
                <span style={{ fontSize: 10, color: RED,   fontWeight: 600 }}>● Negative alpha</span>
                <span style={{ fontSize: 10, color: TEXT2 }}>Heatmap intensity ∝ |Total Alpha|</span>
                <span style={{ fontSize: 10, color: TEXT2 }}>N = # assets in sector</span>
              </div>
              <span style={{ fontSize: 10, color: "#CBD5E1" }}>Brinson-Fachler · GICS sectors · Bloomberg</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
