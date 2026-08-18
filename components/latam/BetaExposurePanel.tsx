"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  ScatterChart,
  Scatter,
  ZAxis,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";
import { Download, AlertTriangle, X, RotateCcw } from "lucide-react";
import { downloadExcel } from "@/lib/exportExcel";
import type {
  BetaExposurePayload,
  BetaExposureFundsPayload,
  FactorDetailPayload,
  AllFactorsDetailPayload,
  FactorExposure,
  PositionExposure,
  FundOption,
} from "@/app/api/latam/beta-exposure/route";
import { PATRIA, FONT_SECONDARY, TEXT } from "@/lib/patriaTheme";

// ── Tokens ────────────────────────────────────────────────────────────────────
const BORDER = "rgba(13,13,56,0.08)";
const TEXT1  = PATRIA.darkBlue;   // Regla 4
const TEXT2  = TEXT.label;
const TEXT3  = TEXT.muted;
const GREEN  = PATRIA.blue;       // positivo
const RED    = PATRIA.pink;       // negativo
const BLUE   = PATRIA.kingBlue;   // Regla 5 / interactivo
const SLATE  = TEXT.muted;

const cardStyle: React.CSSProperties = {
  background:   "#FFFFFF",
  border:       `1px solid ${BORDER}`,
  borderRadius: 12,
  boxShadow:    "0 1px 4px rgba(13,13,56,0.06)",
};

const CONTROL_STYLE: React.CSSProperties = {
  padding:      "7px 11px",
  borderRadius: 7,
  background:   "#F5F7FD",
  border:       "1px solid rgba(13,13,56,0.10)",
  color:        TEXT1,
  fontSize:     13,
  cursor:       "pointer",
  outline:      "none",
  fontFamily:   FONT_SECONDARY,
};

// ── Formatters ────────────────────────────────────────────────────────────────
const fmtBeta   = (v: number, dec = 3) => (v >= 0 ? "" : "−") + Math.abs(v).toFixed(dec);
const fmtSigned = (v: number, dec = 3) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(dec);
const fmtPct    = (v: number, dec = 1) => (v * 100).toFixed(dec) + "%";
const betaColor = (v: number) => (v > 0.0005 ? GREEN : v < -0.0005 ? RED : TEXT2);

// ── KPI card ──────────────────────────────────────────────────────────────────
function KpiCard({
  label, value, valueColor, sub,
}: { label: string; value: string; valueColor?: string; sub?: string }) {
  return (
    <div style={{ ...cardStyle, padding: "14px 18px", display: "flex", flexDirection: "column", gap: 3, flex: 1, minWidth: 150 }}>
      <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.10em", fontFamily: FONT_SECONDARY, color: PATRIA.kingBlue, textTransform: "uppercase" }}>
        {label}
      </span>
      <span style={{ fontSize: 22, fontWeight: 800, fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums", color: valueColor ?? TEXT1, letterSpacing: "-0.02em" }}>
        {value}
      </span>
      {sub && <span style={{ fontSize: 10, color: TEXT3 }}>{sub}</span>}
    </div>
  );
}

// ── Chart tooltip ─────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as FactorExposure;
  if (!row) return null;

  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "1px solid rgba(13,13,56,0.12)",
        boxShadow: "0 4px 16px rgba(13,13,56,0.12)",
        borderRadius: 8,
        padding: "10px 12px",
        fontSize: 12,
        minWidth: 210,
      }}
    >
      <div style={{ fontWeight: 700, color: TEXT1, marginBottom: 7 }}>{label}</div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 24, marginBottom: 3 }}>
        <span style={{ color: TEXT2 }}>Portfolio β</span>
        <span style={{ fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums", fontWeight: 700, color: BLUE }}>
          {fmtBeta(row.portfolioBeta)}
        </span>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 24 }}>
        <span style={{ color: TEXT2 }}>Benchmark β</span>
        <span style={{ fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums", color: "rgba(13,13,56,0.62)" }}>
          {fmtBeta(row.benchmarkBeta)}
        </span>
      </div>

      <div
        style={{
          display: "flex", justifyContent: "space-between", gap: 24,
          marginTop: 6, paddingTop: 6, borderTop: `1px solid ${BORDER}`,
        }}
      >
        <span style={{ color: TEXT2, fontWeight: 600 }}>Active β</span>
        <span style={{ fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums", fontWeight: 800, color: betaColor(row.activeBeta) }}>
          {fmtSigned(row.activeBeta)}
        </span>
      </div>

      <div style={{ marginTop: 6, fontSize: 10, color: TEXT3 }}>
        {row.nPositions} position{row.nPositions !== 1 ? "s" : ""} · {fmtPct(row.portfolioCoverage)} of fund weight
      </div>
    </div>
  );
}

// ── Table ─────────────────────────────────────────────────────────────────────
type SortKey = "factor" | "portfolioBeta" | "benchmarkBeta" | "activeBeta" | "portfolioCoverage";

function FactorTable({
  factors, selected, onSelect,
}: {
  factors: FactorExposure[];
  selected: string | null;
  onSelect: (factor: string) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("activeBeta");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    return [...factors].sort((a, b) => {
      if (sortKey === "factor") {
        return sortDir === "asc"
          ? a.factor.localeCompare(b.factor)
          : b.factor.localeCompare(a.factor);
      }
      const av = a[sortKey];
      const bv = b[sortKey];
      return sortDir === "asc" ? av - bv : bv - av;
    });
  }, [factors, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  const Th = ({ col, label, right }: { col: SortKey; label: string; right?: boolean }) => (
    <th
      onClick={() => toggleSort(col)}
      style={{
        padding: "8px 12px",
        textAlign: right ? "right" : "left",
        fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
        textTransform: "uppercase", color: sortKey === col ? BLUE : TEXT2,
        cursor: "pointer", userSelect: "none", whiteSpace: "nowrap",
        background: "#F5F7FD",
      }}
    >
      {label}{sortKey === col ? (sortDir === "desc" ? " ↓" : " ↑") : ""}
    </th>
  );

  const maxActive = Math.max(...factors.map((f) => Math.abs(f.activeBeta)), 0.0001);

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
        <thead>
          <tr>
            <Th col="factor"            label="Risk Factor"     />
            <Th col="portfolioBeta"     label="Beta Portfolio"  right />
            <Th col="benchmarkBeta"     label="Beta Benchmark"  right />
            <Th col="activeBeta"        label="Active Beta"     right />
            <th style={{ padding: "8px 12px", textAlign: "left", fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: TEXT2, background: "#F5F7FD", width: 130 }}>
              Active
            </th>
            <Th col="portfolioCoverage" label="Coverage"        right />
          </tr>
        </thead>
        <tbody>
          {sorted.map((f, i) => {
            const isSel = selected === f.factor;
            return (
            <tr
              key={f.factor}
              onClick={() => onSelect(f.factor)}
              title="Click to see every position behind this exposure"
              style={{
                background: isSel ? "rgba(32,68,220,0.07)" : i % 2 === 0 ? "#FFFFFF" : "rgba(13,13,56,0.018)",
                borderBottom: "1px solid rgba(13,13,56,0.05)",
                borderLeft: isSel ? `3px solid ${BLUE}` : "3px solid transparent",
                cursor: "pointer",
              }}
            >
              <td style={{ padding: "8px 12px", fontWeight: 600, color: isSel ? BLUE : TEXT1, fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                {f.factor}
              </td>
              <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums", color: TEXT1 }}>
                {fmtBeta(f.portfolioBeta)}
              </td>
              <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums", color: "rgba(13,13,56,0.62)" }}>
                {fmtBeta(f.benchmarkBeta)}
              </td>
              <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums", fontWeight: 700, color: betaColor(f.activeBeta) }}>
                {fmtSigned(f.activeBeta)}
              </td>
              {/* Diverging bar — centred at zero */}
              <td style={{ padding: "8px 12px" }}>
                <div style={{ position: "relative", height: 7, background: "rgba(13,13,56,0.05)", borderRadius: 4 }}>
                  <div style={{ position: "absolute", left: "50%", top: -2, bottom: -2, width: 1, background: "rgba(13,13,56,0.18)" }} />
                  <div
                    style={{
                      position:   "absolute",
                      top:        0,
                      height:     7,
                      borderRadius: 4,
                      width:      `${(Math.abs(f.activeBeta) / maxActive) * 50}%`,
                      left:       f.activeBeta >= 0 ? "50%" : undefined,
                      right:      f.activeBeta < 0 ? "50%" : undefined,
                      background: f.activeBeta >= 0 ? GREEN : RED,
                      opacity:    0.7,
                    }}
                  />
                </div>
              </td>
              <td style={{ padding: "8px 12px", textAlign: "right", fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums", fontSize: 11, color: f.portfolioCoverage < 0.85 ? "#FF6B06" : TEXT3 }}>
                {fmtPct(f.portfolioCoverage)}
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Drill-down: weight × beta scatter ─────────────────────────────────────────
// X = position weight, Y = the company's beta, bubble area = |contribution|.
// Everything above the dashed line pulls the fund's loading up, everything
// below pulls it down; bubble size is how hard it pulls.
function ContributionScatter({
  positions, portfolioBeta, factor,
}: { positions: PositionExposure[]; portfolioBeta: number; factor: string }) {
  const pts = positions
    .filter((p) => p.beta !== null && p.portfolioWeight > 0)
    .map((p) => ({
      ...p,
      x: p.portfolioWeight * 100,
      y: p.beta as number,
      z: Math.abs(p.portfolioContrib),
      over: p.activeWeight >= 0,
    }));

  const over  = pts.filter((p) => p.over);
  const under = pts.filter((p) => !p.over);

  return (
    <div style={{ height: 340, padding: "8px 4px 0" }}>
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 8, right: 24, left: 4, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(13,13,56,0.06)" />
          <XAxis
            type="number" dataKey="x" name="Weight"
            tick={{ fill: TEXT3, fontSize: 10, fontFamily: FONT_SECONDARY }}
            tickLine={false} axisLine={{ stroke: "rgba(13,13,56,0.12)" }}
            tickFormatter={(v: number) => `${v.toFixed(0)}%`}
            label={{ value: "Portfolio weight", position: "insideBottom", offset: -12, fontSize: 10, fill: TEXT2 }}
          />
          <YAxis
            type="number" dataKey="y" name="Beta"
            tick={{ fill: TEXT3, fontSize: 10, fontFamily: FONT_SECONDARY }}
            tickLine={false} axisLine={false} width={52}
            tickFormatter={(v: number) => v.toFixed(2)}
            label={{ value: `β vs ${factor}`, angle: -90, position: "insideLeft", fontSize: 10, fill: TEXT2, style: { textAnchor: "middle" } }}
          />
          <ZAxis type="number" dataKey="z" range={[30, 620]} />
          <ReferenceLine y={0} stroke="rgba(13,13,56,0.35)" />
          <ReferenceLine
            y={portfolioBeta}
            stroke={BLUE}
            strokeDasharray="5 4"
            label={{ value: `fund β ${fmtBeta(portfolioBeta, 2)}`, fontSize: 9.5, fill: BLUE, position: "right" }}
          />
          <Tooltip content={<ScatterTooltip />} cursor={{ strokeDasharray: "3 3" }} />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} iconType="circle" iconSize={8} />
          <Scatter name="Overweight"  data={over}  fill={BLUE}  fillOpacity={0.55} />
          <Scatter name="Underweight" data={under} fill={SLATE} fillOpacity={0.5} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ScatterTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload as PositionExposure & { over: boolean };
  if (!p) return null;
  const Row = ({ k, v, c, bold }: { k: string; v: string; c?: string; bold?: boolean }) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 22 }}>
      <span style={{ color: TEXT2 }}>{k}</span>
      <span style={{ fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums", color: c ?? TEXT1, fontWeight: bold ? 700 : 400 }}>{v}</span>
    </div>
  );
  return (
    <div style={{ background: "#FFF", border: "1px solid rgba(13,13,56,0.12)", boxShadow: "0 4px 16px rgba(13,13,56,0.12)", borderRadius: 8, padding: "10px 12px", fontSize: 11.5, minWidth: 215 }}>
      <div style={{ fontWeight: 700, color: TEXT1, marginBottom: 6 }}>{p.company}</div>
      <Row k="Beta"        v={fmtBeta(p.beta ?? 0)} />
      <Row k="Port. weight" v={fmtPct(p.portfolioWeight, 2)} />
      <Row k="Bench. weight" v={fmtPct(p.benchmarkWeight, 2)} />
      <Row k="Active weight" v={fmtSigned(p.activeWeight * 100, 2) + "%"} c={betaColor(p.activeWeight)} />
      <div style={{ marginTop: 6, paddingTop: 6, borderTop: `1px solid ${BORDER}` }}>
        <Row k="Contrib. to β" v={fmtSigned(p.portfolioContrib)} bold c={BLUE} />
      </div>
    </div>
  );
}

// ── Drill-down: positions table with per-listing toggles ──────────────────────
function PositionsTable({
  positions, dropped, onToggleTicker,
}: {
  positions: PositionExposure[];
  dropped: Set<string>;
  onToggleTicker: (ticker: string) => void;
}) {
  const th: React.CSSProperties = {
    padding: "7px 10px", fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
    textTransform: "uppercase", color: TEXT2, background: "#F5F7FD", whiteSpace: "nowrap",
  };
  const td: React.CSSProperties = {
    padding: "6px 10px", fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums", textAlign: "right",
  };

  return (
    <div style={{ overflowX: "auto", maxHeight: 460, overflowY: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
        <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
          <tr>
            <th style={{ ...th, textAlign: "left" }}>Company</th>
            <th style={{ ...th, textAlign: "left" }}>Listings used</th>
            <th style={{ ...th, textAlign: "right" }}>Beta</th>
            <th style={{ ...th, textAlign: "right" }}>Port W%</th>
            <th style={{ ...th, textAlign: "right" }}>Bench W%</th>
            <th style={{ ...th, textAlign: "right" }}>Active W%</th>
            <th style={{ ...th, textAlign: "right" }}>Contrib β</th>
            <th style={{ ...th, textAlign: "right" }}>Contrib Active β</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p, i) => {
            const off = p.beta === null;
            return (
              <tr
                key={p.company}
                style={{
                  background: off ? "rgba(248,72,94,0.03)" : i % 2 === 0 ? "#FFFFFF" : "rgba(13,13,56,0.018)",
                  borderBottom: "1px solid rgba(13,13,56,0.05)",
                  opacity: off ? 0.6 : 1,
                }}
              >
                <td style={{ padding: "6px 10px", fontWeight: 600, color: TEXT1, whiteSpace: "nowrap" }}>
                  {p.company}
                </td>

                {/* Listing chips — click to drop / restore a ticker */}
                <td style={{ padding: "5px 10px" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {p.listings.map((l) => {
                      const isOut  = l.outlier;
                      const isOff  = isOut || dropped.has(l.ticker.toUpperCase());
                      const single = p.listings.length === 1;
                      return (
                        <button
                          key={l.ticker}
                          onClick={() => { if (!isOut) onToggleTicker(l.ticker); }}
                          disabled={isOut}
                          title={
                            isOut   ? `Excluded by the outlier guard (β = ${l.beta.toFixed(1)})`
                            : isOff ? "Click to put this listing back into the average"
                                    : single
                                      ? "Only listing for this name — dropping it removes the position"
                                      : "Click to drop this listing from the average"
                          }
                          style={{
                            display: "inline-flex", alignItems: "center", gap: 4,
                            fontSize: 9.5, fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums",
                            padding: "2px 7px", borderRadius: 5,
                            cursor: isOut ? "not-allowed" : "pointer",
                            textDecoration: isOff ? "line-through" : "none",
                            background: isOut ? "rgba(255,107,6,0.08)" : isOff ? "rgba(13,13,56,0.05)" : "rgba(32,68,220,0.08)",
                            border: `1px solid ${isOut ? "rgba(255,107,6,0.25)" : isOff ? "rgba(13,13,56,0.12)" : "rgba(32,68,220,0.22)"}`,
                            color: isOut ? "#FF6B06" : isOff ? TEXT3 : BLUE,
                          }}
                        >
                          {l.ticker.replace(/ Equity$/i, "")}
                          <span style={{ opacity: 0.7 }}>{l.beta.toFixed(2)}</span>
                        </button>
                      );
                    })}
                  </div>
                </td>

                <td style={{ ...td, fontWeight: 700, color: off ? RED : TEXT1 }}>
                  {off ? "—" : fmtBeta(p.beta as number)}
                </td>
                <td style={{ ...td, color: TEXT1 }}>{fmtPct(p.portfolioWeight, 2)}</td>
                <td style={{ ...td, color: "rgba(13,13,56,0.62)" }}>{fmtPct(p.benchmarkWeight, 2)}</td>
                <td style={{ ...td, color: betaColor(p.activeWeight) }}>
                  {fmtSigned(p.activeWeight * 100, 2)}%
                </td>
                <td style={{ ...td, fontWeight: 700, color: off ? TEXT3 : TEXT1 }}>
                  {off ? "0.000" : fmtSigned(p.portfolioContrib)}
                </td>
                <td style={{ ...td, color: off ? TEXT3 : betaColor(p.activeContrib) }}>
                  {off ? "0.000" : fmtSigned(p.activeContrib)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Methodology ───────────────────────────────────────────────────────────────
function Methodology({ maxAbsBeta }: { maxAbsBeta: number }) {
  const H = ({ children }: { children: React.ReactNode }) => (
    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", fontFamily: FONT_SECONDARY, color: PATRIA.kingBlue, marginTop: 16, marginBottom: 6 }}>
      {children}
    </div>
  );
  const P = ({ children }: { children: React.ReactNode }) => (
    <p style={{ fontSize: 11.5, color: "rgba(13,13,56,0.62)", lineHeight: 1.65, margin: "0 0 6px" }}>{children}</p>
  );
  const Code = ({ children }: { children: React.ReactNode }) => (
    <code style={{ fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums", fontSize: 11, background: "rgba(13,13,56,0.05)", padding: "1px 5px", borderRadius: 4, color: TEXT1 }}>
      {children}
    </code>
  );

  return (
    <div style={{ ...cardStyle, marginTop: 14, padding: "18px 22px 22px" }}>
      <h2 style={{ fontSize: 13.5, fontWeight: 700, color: TEXT1, margin: 0 }}>Methodology</h2>
      <p style={{ fontSize: 11, color: TEXT2, marginTop: 3 }}>How each number on this page is built.</p>

      <H>1 · Exposure formula</H>
      <P>
        For every risk factor <em>f</em>, exposure is the weighted sum-product of position betas:
      </P>
      <div style={{ fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums", fontSize: 11.5, color: TEXT1, background: "rgba(32,68,220,0.04)", border: `1px solid rgba(32,68,220,0.14)`, borderRadius: 8, padding: "10px 14px", margin: "4px 0 8px", lineHeight: 1.9 }}>
        Portfolio β<sub>f</sub> &nbsp;= &nbsp;Σ<sub>i</sub> ( w<sup>port</sup><sub>i</sub> × β<sub>i,f</sub> )<br />
        Benchmark β<sub>f</sub> = &nbsp;Σ<sub>i</sub> ( w<sup>bench</sup><sub>i</sub> × β<sub>i,f</sub> )<br />
        Active β<sub>f</sub> &nbsp;&nbsp;&nbsp;= &nbsp;Portfolio β<sub>f</sub> − Benchmark β<sub>f</sub>
      </div>
      <P>
        Weights are decimals from <Code>fund_portfolio_weights</Code> for the selected fund and report
        date, and they sum to ~1.00. A name held only by the benchmark still enters the benchmark leg
        with <Code>w_port = 0</Code>. In the drill-down, a position&apos;s contribution to the active
        beta is <Code>(w_port − w_bench) × β</Code>, and those contributions sum to the Active β above.
      </P>

      <H>2 · Data lineage</H>
      <P>
        <Code>fund_portfolio_weights.company</Code> → <Code>empresas_industrias_v2.nombre_latam</Code>{" "}
        → <Code>ticker_bloomberg</Code> → <Code>beta_sensitivity.company</Code>. Betas are pre-computed
        upstream and stored per (ticker, factor); this page never estimates a regression, it only
        aggregates. &ldquo;Coverage&rdquo; is the share of fund weight that resolved to at least one beta —
        read exposures as understated by whatever is missing.
      </P>

      <H>3 · Multiple listings per company</H>
      <P>
        <Code>nombre_latam</Code> is not unique: ADRs and share classes of one issuer share a name
        (PETROBRAS → PETR3, PETR4, PBR, PBR/A). Joining straight through would count that holding&apos;s
        weight four times, so betas are first collapsed to <strong>one per company and factor by
        averaging the listings</strong>. They track each other closely, so the blend is stable. Use the
        chips in the drill-down to drop any listing you do not want in that average — the headline
        chart, the table and the Excel export all recompute together.
      </P>

      <H>4 · Outlier guard</H>
      <P>
        A few illiquid listings come back from the upstream regression with |β| in the hundreds — broken
        fits, not risk loadings. Betas with <Code>|β| &gt; {maxAbsBeta}</Code> are dropped by default and
        always reported; untick <em>Exclude β outliers</em> to include them. Real equity loadings on
        these factors sit well inside ±5.
      </P>

      <H>5 · Reading the scatter</H>
      <P>
        Each bubble is a position: horizontal is its portfolio weight, vertical is its beta, and bubble
        area is |w × β| — how much it moves the fund number. The dashed line is the fund&apos;s overall
        loading, so names above it pull the exposure up and names below pull it down. Blue is
        overweight versus the benchmark, grey underweight.
      </P>
    </div>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────
export default function BetaExposurePanel() {
  const [funds, setFunds]     = useState<FundOption[]>([]);
  const [fundName, setFundName]     = useState<string>("");
  const [reportDate, setReportDate] = useState<string>("");

  const [data, setData]       = useState<BetaExposurePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  // Outlier guard on by default — a few listings carry |β| in the hundreds
  const [guard, setGuard]     = useState(true);

  // Drill-down: clicked factor + its per-position detail
  const [selFactor, setSelFactor] = useState<string | null>(null);
  const [detail, setDetail]       = useState<FactorDetailPayload | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Listings the user dropped from the blended averages (uppercase tickers)
  const [dropped, setDropped] = useState<Set<string>>(new Set());
  const droppedParam = useMemo(() => Array.from(dropped).join(","), [dropped]);

  const [exporting, setExporting] = useState(false);

  // ── Load fund catalogue ────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/latam/beta-exposure")
      .then((r) => r.json())
      .then((d: BetaExposureFundsPayload & { error?: string }) => {
        if (d.error || !d.funds?.length) {
          setError(d.error ?? "No funds available");
          setLoading(false);
          return;
        }
        setFunds(d.funds);
        // Prefer a LATAM fund as the default selection
        const first = d.funds.find((f) => f.region === "LATAM") ?? d.funds[0];
        setFundName(first.fundName);
        setReportDate(first.dates[0] ?? "");
      })
      .catch(() => { setError("Failed to load funds"); setLoading(false); });
  }, []);

  const selectedFund = funds.find((f) => f.fundName === fundName);

  // ── Load exposures ─────────────────────────────────────────────────────────
  const fetchExposure = useCallback(() => {
    if (!fundName || !reportDate) return;
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({ fundName, reportDate });
    if (!guard) qs.set("maxAbsBeta", "0");
    if (droppedParam) qs.set("excludeTickers", droppedParam);
    fetch(`/api/latam/beta-exposure?${qs}`)
      .then((r) => r.json())
      .then((d: BetaExposurePayload & { error?: string }) => {
        if (d.error) { setError(d.error); setData(null); }
        else         { setData(d); }
        setLoading(false);
      })
      .catch(() => { setError("Failed to load beta exposure"); setLoading(false); });
  }, [fundName, reportDate, guard, droppedParam]);

  useEffect(() => { fetchExposure(); }, [fetchExposure]);

  // ── Load drill-down for the selected factor ────────────────────────────────
  useEffect(() => {
    if (!selFactor || !fundName || !reportDate) { setDetail(null); return; }
    setDetailLoading(true);
    const qs = new URLSearchParams({ fundName, reportDate, factor: selFactor });
    if (!guard) qs.set("maxAbsBeta", "0");
    if (droppedParam) qs.set("excludeTickers", droppedParam);
    fetch(`/api/latam/beta-exposure?${qs}`)
      .then((r) => r.json())
      .then((d: FactorDetailPayload & { error?: string }) => {
        setDetail(d.error ? null : d);
        setDetailLoading(false);
      })
      .catch(() => setDetailLoading(false));
  }, [selFactor, fundName, reportDate, guard, droppedParam]);

  // Keep the date valid when the fund changes
  function handleFundChange(next: string) {
    setFundName(next);
    const f = funds.find((x) => x.fundName === next);
    setReportDate(f?.dates[0] ?? "");
  }

  function toggleTicker(ticker: string) {
    const key = ticker.toUpperCase();
    setDropped((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const chartData = data?.factors ?? [];
  const lowCoverage =
    data != null &&
    data.coverage.portfolioWeight > 0 &&
    data.coverage.portfolioCovered / data.coverage.portfolioWeight < 0.9;

  // Excel sheet names: max 31 chars, and : \ / ? * [ ] are illegal
  const sheetName = (s: string) => s.replace(/[:\\/?*[\]]/g, "-").slice(0, 31);

  async function handleExport() {
    if (!data) return;
    setExporting(true);
    try {
      // Pull every factor's per-company detail — the export carries the whole
      // drill-down, not just whichever tab happens to be open.
      const qs = new URLSearchParams({ fundName, reportDate, factor: "*" });
      if (!guard) qs.set("maxAbsBeta", "0");
      if (droppedParam) qs.set("excludeTickers", droppedParam);
      const all: AllFactorsDetailPayload | { error?: string } =
        await fetch(`/api/latam/beta-exposure?${qs}`).then((r) => r.json());
      const bulk = "error" in all && all.error ? null : (all as AllFactorsDetailPayload);

      const sheets: Parameters<typeof downloadExcel>[0] = [];

      // 1 ── Factor summary
      sheets.push({
        name: "Summary",
        headers: ["Risk Factor", "Beta Portfolio", "Beta Benchmark", "Active Beta", "Positions", "Port. Coverage", "Bench. Coverage"],
        rows: data.factors.map((f) => [
          f.factor, f.portfolioBeta, f.benchmarkBeta, f.activeBeta,
          f.nPositions, f.portfolioCoverage, f.benchmarkCoverage,
        ]),
      });

      if (bulk) {
        // 2 ── Wide matrix: one row per company, one β column per factor
        sheets.push({
          name: "Beta by company",
          headers: [
            "Company", "Port W%", "Bench W%", "Active W%",
            ...bulk.factors.map((f) => `β ${f}`),
          ],
          rows: [
            ...bulk.rows.map((r) => [
              r.company, r.portfolioWeight, r.benchmarkWeight, r.activeWeight,
              ...bulk.factors.map((f) => r.byFactor[f]?.beta ?? null),
            ]),
            // Weighted totals tie back to the summary sheet
            [
              "PORTFOLIO β (Σ w×β)", null, null, null,
              ...bulk.factors.map((f) => bulk.totals[f]?.portfolioBeta ?? null),
            ],
            [
              "BENCHMARK β (Σ w×β)", null, null, null,
              ...bulk.factors.map((f) => bulk.totals[f]?.benchmarkBeta ?? null),
            ],
            [
              "ACTIVE β", null, null, null,
              ...bulk.factors.map((f) => bulk.totals[f]?.activeBeta ?? null),
            ],
          ],
        });

        // 3 ── One sheet per factor: the click-through view, company by company
        for (const f of bulk.factors) {
          const benchBeta = bulk.totals[f]?.benchmarkBeta ?? 0;
          sheets.push({
            name: sheetName(f),
            headers: [
              "Company", "Listings used", "Beta", "Benchmark β (fund)", "Beta vs Bench",
              "Port W%", "Bench W%", "Active W%",
              "Contrib Port β", "Contrib Bench β", "Contrib Active β",
            ],
            rows: bulk.rows
              .map((r) => ({ r, c: r.byFactor[f] }))
              .filter((x) => x.c)
              .sort((a, b) => Math.abs(b.c.portfolioContrib) - Math.abs(a.c.portfolioContrib))
              .map(({ r, c }) => [
                r.company, c.tickersUsed, c.beta, benchBeta,
                c.beta === null ? null : c.beta - benchBeta,
                r.portfolioWeight, r.benchmarkWeight, r.activeWeight,
                c.portfolioContrib, c.benchmarkContrib, c.activeContrib,
              ]),
          });
        }
      }

      // 4 ── Diagnostics
      sheets.push({
        name: "Unmapped",
        headers: ["Company", "Portfolio Weight", "Benchmark Weight", "Reason"],
        rows: data.unmapped.map((u) => [
          u.company, u.portfolioWeight, u.benchmarkWeight,
          u.reason === "no_ticker" ? "No Bloomberg ticker mapping" : "No beta data",
        ]),
      });
      sheets.push({
        name: "Blended listings",
        headers: ["Company", "Listings averaged", "Tickers"],
        rows: data.blended.map((b) => [b.company, b.nListings, b.tickers]),
      });
      if (data.excluded.length > 0) {
        sheets.push({
          name: "Excluded outliers",
          headers: ["Company", "Ticker", "Factor", "Beta"],
          rows: data.excluded.map((x) => [x.company, x.ticker, x.factor, x.beta]),
        });
      }

      await downloadExcel(sheets, `beta_exposure_${data.fundName}_${data.reportDate}`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      {/* ── Filters ──────────────────────────────────────────────────────────── */}
      <div style={{ ...cardStyle, padding: "12px 16px", marginBottom: 14, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", fontFamily: FONT_SECONDARY, color: PATRIA.kingBlue }}>
          Fund
        </span>
        <select
          value={fundName}
          onChange={(e) => handleFundChange(e.target.value)}
          style={{ ...CONTROL_STYLE, minWidth: 220 }}
        >
          {funds.map((f) => (
            <option key={f.fundName} value={f.fundName}>
              {f.displayName} · {f.region}
            </option>
          ))}
        </select>

        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", fontFamily: FONT_SECONDARY, color: PATRIA.kingBlue, marginLeft: 6 }}>
          Report date
        </span>
        <select
          value={reportDate}
          onChange={(e) => setReportDate(e.target.value)}
          style={{ ...CONTROL_STYLE, minWidth: 150 }}
        >
          {(selectedFund?.dates ?? []).map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>

        <label
          title="Drops betas with |β| > 10 — broken regressions on illiquid listings that otherwise swamp the sum-product"
          style={{
            display: "flex", alignItems: "center", gap: 6, marginLeft: 6,
            fontSize: 11.5, color: TEXT2, cursor: "pointer", userSelect: "none",
          }}
        >
          <input type="checkbox" checked={guard} onChange={(e) => setGuard(e.target.checked)} style={{ cursor: "pointer", accentColor: BLUE }} />
          Exclude β outliers
        </label>

        {data && (
          <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 11, color: TEXT3, fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums" }}>
              vs {data.benchmarkName}
              {data.betaAsOf && <> · betas as of {data.betaAsOf}</>}
            </span>
            <button
              onClick={handleExport}
              disabled={exporting}
              title="Summary + one sheet per factor with every company's beta"
              style={{
                display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600,
                color: GREEN, background: "rgba(0,30,175,0.07)", border: "1px solid rgba(0,30,175,0.22)",
                borderRadius: 7, padding: "5px 14px", cursor: exporting ? "wait" : "pointer",
                transition: "all 0.12s", opacity: exporting ? 0.6 : 1,
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(0,30,175,0.13)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(0,30,175,0.07)"; }}
            >
              <Download size={12} /> {exporting ? "Building…" : "Excel (full detail)"}
            </button>
          </span>
        )}
      </div>

      {/* ── Loading ──────────────────────────────────────────────────────────── */}
      {loading && (
        <div style={{ ...cardStyle, padding: "60px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
          <div
            className="w-8 h-8 rounded-full border-2 animate-spin"
            style={{ borderColor: "rgba(32,68,220,0.15)", borderTopColor: BLUE }}
          />
          <span style={{ fontSize: 12, color: TEXT2, fontFamily: FONT_SECONDARY }}>Computing factor exposures…</span>
        </div>
      )}

      {/* ── Error ────────────────────────────────────────────────────────────── */}
      {!loading && error && (
        <div style={{ ...cardStyle, padding: "28px", textAlign: "center", borderColor: "rgba(248,72,94,0.18)", background: "rgba(248,72,94,0.03)" }}>
          <p style={{ color: RED, fontSize: 13, marginBottom: 12 }}>{error}</p>
          <button
            onClick={fetchExposure}
            style={{ padding: "6px 18px", borderRadius: 6, background: "rgba(32,68,220,0.08)", border: "1px solid rgba(32,68,220,0.20)", color: BLUE, cursor: "pointer", fontSize: 13 }}
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Content ──────────────────────────────────────────────────────────── */}
      {!loading && !error && data && (
        <>
          {data.factors.length === 0 ? (
            <div style={{ ...cardStyle, padding: "40px", textAlign: "center" }}>
              <p style={{ fontSize: 13, color: TEXT2 }}>
                No beta data matched this portfolio. Check that <code>beta_sensitivity.company</code>{" "}
                holds Bloomberg tickers present in <code>empresas_industrias_v2</code>.
              </p>
            </div>
          ) : (
            <>
              {/* KPIs */}
              <div style={{ display: "flex", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
                <KpiCard label="Risk factors" value={String(data.factors.length)} sub={`${data.coverage.nCovered} of ${data.coverage.nHoldings} names with betas`} />
                <KpiCard
                  label="Fund weight covered"
                  value={fmtPct(data.coverage.portfolioWeight > 0 ? data.coverage.portfolioCovered / data.coverage.portfolioWeight : 0)}
                  valueColor={lowCoverage ? "#FF6B06" : TEXT1}
                  sub={`Bench. ${fmtPct(data.coverage.benchmarkWeight > 0 ? data.coverage.benchmarkCovered / data.coverage.benchmarkWeight : 0)}`}
                />
                {(() => {
                  const top = [...data.factors].sort((a, b) => Math.abs(b.activeBeta) - Math.abs(a.activeBeta))[0];
                  return (
                    <KpiCard
                      label="Largest active bet"
                      value={fmtSigned(top.activeBeta, 2)}
                      valueColor={betaColor(top.activeBeta)}
                      sub={top.factor}
                    />
                  );
                })()}
                <KpiCard label="Report date" value={data.reportDate} sub={data.displayName} />
              </div>

              {/* Outlier guard report — never drop data silently */}
              {data.excluded.length > 0 && (
                <div
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 8,
                    background: "rgba(32,68,220,0.04)", border: "1px solid rgba(32,68,220,0.18)",
                    borderRadius: 9, padding: "9px 13px", marginBottom: 14, fontSize: 11.5, color: "#001EAF",
                  }}
                >
                  <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>
                    {data.excluded.length} beta{data.excluded.length !== 1 ? "s" : ""} excluded as broken
                    regressions (|β| &gt; {data.maxAbsBeta}):{" "}
                    {data.excluded.slice(0, 4).map((x) => `${x.ticker} ${x.factor} ${x.beta.toFixed(0)}`).join(", ")}
                    {data.excluded.length > 4 && ` +${data.excluded.length - 4} more`}. Untick
                    &ldquo;Exclude β outliers&rdquo; to include them.
                  </span>
                </div>
              )}

              {/* Coverage warning */}
              {lowCoverage && (
                <div
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 8,
                    background: "rgba(255,107,6,0.05)", border: "1px solid rgba(255,107,6,0.20)",
                    borderRadius: 9, padding: "9px 13px", marginBottom: 14, fontSize: 11.5, color: "#FF6B06",
                  }}
                >
                  <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>
                    Only {fmtPct(data.coverage.portfolioCovered / data.coverage.portfolioWeight)} of fund weight has
                    beta data — exposures below are absolute sum-products and therefore understate the true factor
                    loading. Missing:{" "}
                    {data.unmapped.slice(0, 4).map((u) => `${u.company} (${fmtPct(u.portfolioWeight, 2)})`).join(", ")}
                    {data.unmapped.length > 4 && ` +${data.unmapped.length - 4} more`}.
                  </span>
                </div>
              )}

              {/* Chart */}
              <div style={{ ...cardStyle, marginBottom: 14, overflow: "hidden" }}>
                <div style={{ padding: "14px 20px", borderBottom: `1px solid ${BORDER}` }}>
                  <h2 style={{ fontSize: 13.5, fontWeight: 700, color: TEXT1, margin: 0 }}>
                    Factor exposure — {data.displayName} vs {data.benchmarkName}
                  </h2>
                  <p style={{ fontSize: 11, color: TEXT2, marginTop: 3 }}>
                    Weighted sum-product of position betas · hover a factor for the active difference
                  </p>
                </div>

                <div style={{ height: Math.max(340, chartData.length * 46 + 80), padding: "16px 8px 8px" }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 4, right: 24, left: 4, bottom: 4 }} barGap={4} barCategoryGap="26%">
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(13,13,56,0.06)" vertical={false} />
                      <XAxis
                        dataKey="factor"
                        tick={{ fill: "rgba(13,13,56,0.62)", fontSize: 11, fontFamily: FONT_SECONDARY }}
                        axisLine={{ stroke: "rgba(13,13,56,0.12)" }}
                        tickLine={false}
                        interval={0}
                        angle={chartData.length > 8 ? -25 : 0}
                        textAnchor={chartData.length > 8 ? "end" : "middle"}
                        height={chartData.length > 8 ? 60 : 30}
                      />
                      <YAxis
                        tick={{ fill: TEXT3, fontSize: 10, fontFamily: FONT_SECONDARY }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v: number) => v.toFixed(2)}
                        width={52}
                      />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(32,68,220,0.04)" }} />
                      <Legend
                        wrapperStyle={{ fontSize: 11.5, paddingTop: 6 }}
                        iconType="circle"
                        iconSize={8}
                      />
                      <ReferenceLine y={0} stroke="rgba(13,13,56,0.35)" strokeWidth={1} />
                      <Bar dataKey="portfolioBeta" name="Portfolio"  fill={BLUE}  radius={[3, 3, 0, 0]} maxBarSize={44} />
                      <Bar dataKey="benchmarkBeta" name="Benchmark"  fill={SLATE} radius={[3, 3, 0, 0]} maxBarSize={44} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Table */}
              <div style={{ ...cardStyle, overflow: "hidden" }}>
                <div style={{ padding: "14px 20px", borderBottom: `1px solid ${BORDER}` }}>
                  <h2 style={{ fontSize: 13.5, fontWeight: 700, color: TEXT1, margin: 0 }}>Exposure detail</h2>
                  <p style={{ fontSize: 11, color: TEXT2, marginTop: 3 }}>
                    Active Beta = Portfolio − Benchmark · coverage is the share of fund weight carrying a beta for that factor
                  </p>
                </div>
                <FactorTable
                  factors={data.factors}
                  selected={selFactor}
                  onSelect={(f) => setSelFactor((cur) => (cur === f ? null : f))}
                />

                {/* Methodology note — ADRs and share classes share one nombre_latam */}
                {data.blended.length > 0 && (
                  <details style={{ borderTop: `1px solid ${BORDER}`, padding: "10px 20px" }}>
                    <summary style={{ fontSize: 11, color: TEXT2, cursor: "pointer", userSelect: "none" }}>
                      {data.blended.length} name{data.blended.length !== 1 ? "s" : ""} carry several
                      listings (ADR / share classes) — beta averaged across them
                    </summary>
                    <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: "4px 18px" }}>
                      {data.blended.map((b) => (
                        <span key={b.company} style={{ fontSize: 10.5, color: TEXT3, fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums" }}>
                          <span style={{ color: "rgba(13,13,56,0.62)" }}>{b.company}</span> · {b.tickers}
                        </span>
                      ))}
                    </div>
                  </details>
                )}
              </div>

              {/* ── Drill-down for the clicked factor ───────────────────────── */}
              {selFactor && (
                <div style={{ ...cardStyle, marginTop: 14, overflow: "hidden", borderColor: "rgba(32,68,220,0.22)" }}>
                  <div style={{ padding: "14px 20px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <h2 style={{ fontSize: 13.5, fontWeight: 700, color: TEXT1, margin: 0 }}>
                        What&apos;s inside <span style={{ fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums", color: BLUE }}>{selFactor}</span>
                      </h2>
                      <p style={{ fontSize: 11, color: TEXT2, marginTop: 3 }}>
                        Every position behind the exposure · click a ticker chip to drop it from a blended average
                      </p>
                    </div>

                    {detail && (
                      <span style={{ display: "flex", gap: 18, marginLeft: "auto", alignItems: "center", flexWrap: "wrap" }}>
                        {[
                          { l: "Portfolio β", v: fmtBeta(detail.totals.portfolioBeta), c: BLUE },
                          { l: "Benchmark β", v: fmtBeta(detail.totals.benchmarkBeta), c: "rgba(13,13,56,0.62)" },
                          { l: "Active β",    v: fmtSigned(detail.totals.activeBeta),  c: betaColor(detail.totals.activeBeta) },
                        ].map((k) => (
                          <span key={k.l} style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: TEXT2 }}>{k.l}</span>
                            <span style={{ fontSize: 15, fontWeight: 800, fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums", color: k.c }}>{k.v}</span>
                          </span>
                        ))}
                        <button
                          onClick={() => setSelFactor(null)}
                          title="Close"
                          style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "transparent", border: `1px solid ${BORDER}`, borderRadius: 7, padding: "4px 10px", cursor: "pointer", color: TEXT2, fontSize: 11 }}
                        >
                          <X size={12} /> Close
                        </button>
                      </span>
                    )}
                  </div>

                  {/* Dropped-ticker bar */}
                  {dropped.size > 0 && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "9px 20px", borderBottom: `1px solid ${BORDER}`, background: "rgba(13,13,56,0.02)" }}>
                      <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", fontFamily: FONT_SECONDARY, color: PATRIA.kingBlue }}>
                        Dropped listings
                      </span>
                      {Array.from(dropped).map((t) => (
                        <button
                          key={t}
                          onClick={() => toggleTicker(t)}
                          title="Put this listing back"
                          style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9.5, fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums", padding: "2px 7px", borderRadius: 5, background: "rgba(13,13,56,0.05)", border: `1px solid ${BORDER}`, color: TEXT2, cursor: "pointer" }}
                        >
                          {t.replace(/ EQUITY$/i, "")} <X size={9} />
                        </button>
                      ))}
                      <button
                        onClick={() => setDropped(new Set())}
                        style={{ display: "inline-flex", alignItems: "center", gap: 4, marginLeft: 4, fontSize: 10.5, background: "transparent", border: "none", color: BLUE, cursor: "pointer" }}
                      >
                        <RotateCcw size={11} /> Reset all
                      </button>
                    </div>
                  )}

                  {detailLoading && !detail ? (
                    <div style={{ padding: "50px 0", textAlign: "center", fontSize: 12, color: TEXT2, fontFamily: FONT_SECONDARY }}>
                      Loading positions…
                    </div>
                  ) : detail ? (
                    <>
                      <ContributionScatter
                        positions={detail.positions}
                        portfolioBeta={detail.totals.portfolioBeta}
                        factor={detail.factor}
                      />
                      <PositionsTable
                        positions={detail.positions}
                        dropped={dropped}
                        onToggleTicker={toggleTicker}
                      />
                    </>
                  ) : (
                    <div style={{ padding: "40px 0", textAlign: "center", fontSize: 12, color: TEXT2 }}>
                      No positions found for this factor.
                    </div>
                  )}
                </div>
              )}

              {/* ── Methodology ────────────────────────────────────────────── */}
              <Methodology maxAbsBeta={data.maxAbsBeta} />
            </>
          )}
        </>
      )}
    </div>
  );
}
