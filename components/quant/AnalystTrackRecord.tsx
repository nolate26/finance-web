"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  ComposedChart, Bar, Line, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ReferenceArea, ReferenceDot, ResponsiveContainer,
} from "recharts";
import type { TrackRecordOptions } from "@/app/api/analysis/track-record/options/route";
import type {
  PreviewRow, CalcRow, PreviewPayload, CalcPayload,
  EquityPoint, Marker, Summary,
} from "@/app/api/analysis/track-record/route";
import AddRecommendationModal from "./AddRecommendationModal";

// ── Design tokens (match QuantModelTable) ───────────────────────────────────────
const TEXT1   = "#0F172A";
const TEXT2   = "#64748B";
const TEXT3   = "#94A3B8";
const BORDER  = "rgba(15,23,42,0.08)";
const BLUE    = "#2B5CE0";
const GREEN   = "#15803D";
const RED     = "#B91C1C";

const CURRENCIES = ["Local", "USD", "CLP", "BRL", "MXN", "COP", "PEN", "ARS"];

// ── Helpers ─────────────────────────────────────────────────────────────────────
function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "2-digit" });
}
function fmtPrice(v: number | null) {
  if (v == null) return "—";
  return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function recColor(rec: string): string {
  const r = rec.toLowerCase();
  if (/(buy|comprar|sobreponderar|overweight|outperform)/.test(r)) return GREEN;
  if (/(sell|vender|subponderar|underweight|underperform)/.test(r)) return RED;
  return TEXT2;
}
function fmtPct(v: number | null, sign = true) {
  if (v == null) return "—";
  return `${sign && v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

const DIR_META: Record<CalcRow["direction"], { label: string; color: string; bg: string; arrow: string }> = {
  long:  { label: "Long",  color: GREEN, bg: "rgba(21,128,61,0.08)",  arrow: "▲" },
  short: { label: "Short", color: RED,   bg: "rgba(185,28,28,0.08)",  arrow: "▼" },
  flat:  { label: "Flat",  color: TEXT3, bg: "rgba(15,23,42,0.04)",   arrow: "–" },
};
function DirBadge({ d }: { d: CalcRow["direction"] }) {
  const m = DIR_META[d];
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, color: m.color, background: m.bg,
      border: `1px solid ${BORDER}`, padding: "2px 7px", borderRadius: 4, whiteSpace: "nowrap",
    }}>
      {m.arrow} {m.label}
    </span>
  );
}

// ── Chart point + tooltip ───────────────────────────────────────────────────────
interface ChartPoint extends CalcRow { rec: string; label: string }

function fmtShort(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function BarTooltip({ active, payload }: { active?: boolean; payload?: { payload: ChartPoint }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div style={{
      background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 8,
      padding: "9px 12px", boxShadow: "0 4px 16px rgba(15,23,42,0.10)", minWidth: 180,
    }}>
      <p style={{ ...MONO, color: TEXT2, marginBottom: 6 }}>
        {fmtDate(p.entryDate)} → {fmtDate(p.exitDate)}
      </p>
      <p style={{ fontSize: 11, marginBottom: 4 }}>
        <span style={{ fontWeight: 700, color: recColor(p.rec) }}>{p.rec}</span>
        <span style={{ color: TEXT3 }}> · {DIR_META[p.direction].label}</span>
      </p>
      <p style={{ ...MONO, color: TEXT2, marginBottom: 2 }}>Price move: {fmtPct(p.priceReturn)}</p>
      <p style={{ ...MONO, color: p.direction === "flat" ? TEXT3 : (p.periodReturn ?? 0) >= 0 ? GREEN : RED, marginBottom: 2 }}>
        Return: {p.direction === "flat" ? "Flat" : fmtPct(p.periodReturn)}
      </p>
      <p style={{ ...MONO, color: (p.compound ?? 0) >= 0 ? GREEN : RED }}>Compound: {fmtPct(p.compound)}</p>
    </div>
  );
}

function LegendDot({ color, label, line }: { color: string; label: string; line?: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, color: TEXT2 }}>
      <span style={{ width: line ? 14 : 9, height: line ? 2.5 : 9, borderRadius: 2, background: color }} />
      {label}
    </span>
  );
}

// ── Methodology popover (ⓘ) ─────────────────────────────────────────────────────
function Method({ what, how, value }: { what: string; how: string; value: string }) {
  const Row = ({ k, v }: { k: string; v: string }) => (
    <div style={{ marginBottom: 6 }}>
      <span style={{ color: TEXT1, fontWeight: 700 }}>{k}:</span>{" "}
      <span style={{ color: TEXT2 }}>{v}</span>
    </div>
  );
  return (
    <div style={{ fontSize: 11.5, lineHeight: 1.5 }}>
      <Row k="Qué hace" v={what} />
      <Row k="Metodología" v={how} />
      <Row k="Valor" v={value} />
      <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${BORDER}`, fontSize: 10.5, color: TEXT3, lineHeight: 1.45 }}>
        <b style={{ color: TEXT2 }}>Datos:</b> recomendaciones históricas de analistas (BDD propia) + precios diarios de Yahoo Finance (adjclose, ajustado por dividendos/splits), convertidos a la moneda elegida con el FX de cada fecha.{" "}
        <b style={{ color: TEXT2 }}>Base:</b> cada recomendación define una posición — Comprar = long, Vender = short, Mantener = fuera — desde su fecha hasta la siguiente (la última, hasta hoy).
      </div>
    </div>
  );
}

function InfoTip({ content }: { content: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  return (
    <div ref={ref} style={{ position: "relative", display: "inline-flex" }}>
      <button onClick={() => setOpen(v => !v)} aria-label="Methodology" title="Metodología"
        style={{
          width: 17, height: 17, borderRadius: "50%", border: `1px solid ${open ? BLUE : BORDER}`,
          background: open ? "rgba(43,92,224,0.10)" : "#fff", color: open ? BLUE : TEXT3,
          fontSize: 10.5, fontWeight: 800, fontStyle: "italic", cursor: "pointer",
          display: "inline-flex", alignItems: "center", justifyContent: "center", lineHeight: 1, padding: 0,
        }}>
        i
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 60, width: 330,
          background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 10,
          boxShadow: "0 8px 28px rgba(15,23,42,0.16)", padding: "12px 14px",
        }}>
          {content}
        </div>
      )}
    </div>
  );
}

const epoch = (iso: string) => new Date(iso + "T00:00:00.000Z").getTime();
const axisTick = { fill: TEXT3, fontSize: 10, fontFamily: "JetBrains Mono, monospace" };
const tickDate = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "short", year: "2-digit" });

// ── Equity curve (hero): strategy vs benchmark, cumulative % over time ──────────
function EquityTooltip({ active, payload, label, benchLabel }: {
  active?: boolean; payload?: { dataKey: string; value: number | null }[]; label?: number; benchLabel?: string;
}) {
  if (!active || !payload?.length) return null;
  const get = (k: string) => payload.find(p => p.dataKey === k)?.value ?? null;
  const strat = get("strat"), bench = get("bench");
  const alpha = strat != null && bench != null ? strat - bench : null;
  return (
    <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px", boxShadow: "0 4px 16px rgba(15,23,42,0.10)", minWidth: 170 }}>
      <p style={{ ...MONO, color: TEXT2, marginBottom: 6 }}>{label ? tickDate(label) : ""}</p>
      <p style={{ ...MONO, color: (strat ?? 0) >= 0 ? GREEN : RED, marginBottom: 2 }}>Strategy: {fmtPct(strat)}</p>
      <p style={{ ...MONO, color: TEXT2, marginBottom: alpha != null ? 2 : 0 }}>{benchLabel ?? "Benchmark"}: {fmtPct(bench)}</p>
      {alpha != null && <p style={{ ...MONO, color: alpha >= 0 ? GREEN : RED }}>Alpha: {fmtPct(alpha)}</p>}
    </div>
  );
}

function EquityChart({ data, benchLabel }: { data: EquityPoint[]; benchLabel: string }) {
  const rows = useMemo(() => data.map(d => ({ t: epoch(d.date), strat: d.strat, bench: d.bench })), [data]);

  // Contiguous time segments where the strategy is ahead of (or behind) the
  // benchmark, so the background shows at a glance when it wins vs loses.
  const segs = useMemo(() => {
    const out: { x1: number; x2: number; win: boolean }[] = [];
    let start: number | null = null, win: boolean | null = null, prev: number | null = null;
    for (const r of rows) {
      if (r.bench == null) {
        if (start != null && win != null && prev != null) out.push({ x1: start, x2: prev, win });
        start = null; win = null; prev = r.t; continue;
      }
      const w = r.strat >= r.bench;
      if (win == null) { start = r.t; win = w; }
      else if (w !== win) { out.push({ x1: start!, x2: r.t, win }); start = r.t; win = w; }
      prev = r.t;
    }
    if (start != null && win != null && prev != null) out.push({ x1: start, x2: prev, win });
    return out;
  }, [rows]);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={rows} margin={{ top: 6, right: 8, bottom: 0, left: -6 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.05)" vertical={false} />
        {/* Background: green where strategy beats benchmark, red where it lags */}
        {segs.map((s, i) => (
          <ReferenceArea key={i} x1={s.x1} x2={s.x2}
            fill={s.win ? GREEN : RED} fillOpacity={0.16}
            stroke={s.win ? GREEN : RED} strokeOpacity={0.25} />
        ))}
        <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} scale="time"
          tick={axisTick} tickLine={false} axisLine={false} tickFormatter={tickDate} minTickGap={36} />
        <YAxis tick={axisTick} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} width={46} />
        <ReferenceLine y={0} stroke="rgba(15,23,42,0.25)" />
        <Tooltip content={(p) => <EquityTooltip {...(p as object)} benchLabel={benchLabel} />} />
        <Line type="monotone" dataKey="bench" stroke="#94A3B8" strokeWidth={1.6} strokeDasharray="5 3" dot={false} isAnimationActive={false} connectNulls />
        <Line type="monotone" dataKey="strat" stroke={BLUE} strokeWidth={2.4} dot={false} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ── Price line (native) with recommendation markers, targets and position ribbon ─
function PriceChart({ priceLine, markers, rows, ccy }: {
  priceLine: { date: string; price: number }[];
  markers: Marker[];
  rows: CalcRow[];
  ccy: string;
}) {
  const data = useMemo(() => priceLine.map(p => ({ t: epoch(p.date), price: p.price })), [priceLine]);

  // Zoom the Y-axis to the price range (+8% padding) so Buy/Sell dots, which sit on
  // the price line, are clearly visible. Targets are clipped (ifOverflow="hidden")
  // instead of stretching the scale.
  const yDomain = useMemo<[number, number]>(() => {
    const ps = data.map(d => d.price);
    if (!ps.length) return [0, 1];
    const lo = Math.min(...ps), hi = Math.max(...ps);
    const pad = (hi - lo) * 0.08 || hi * 0.05 || 1;
    return [Math.max(0, lo - pad), hi + pad];
  }, [data]);

  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -6 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.05)" vertical={false} />
        <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} scale="time"
          tick={axisTick} tickLine={false} axisLine={false} tickFormatter={tickDate} minTickGap={36} />
        <YAxis domain={yDomain} allowDataOverflow tick={axisTick} tickLine={false} axisLine={false}
          tickFormatter={(v) => v.toLocaleString("en-US", { maximumFractionDigits: 0 })} width={52} />
        <Tooltip
          labelFormatter={(t) => tickDate(t as number)}
          formatter={(v: number) => [v.toLocaleString("en-US", { maximumFractionDigits: 2 }), `Price (${ccy})`]}
        />

        {/* Position ribbon: one shaded band per holding period */}
        {rows.map((r, i) => r.entryDate && r.exitDate && r.direction !== "flat" ? (
          <ReferenceArea key={`ra${i}`} x1={epoch(r.entryDate)} x2={epoch(r.exitDate)}
            fill={r.direction === "long" ? GREEN : RED} fillOpacity={0.16}
            stroke={r.direction === "long" ? GREEN : RED} strokeOpacity={0.25} />
        ) : null)}

        <Line type="monotone" dataKey="price" stroke={TEXT1} strokeWidth={2} dot={false} isAnimationActive={false} />

        {/* Target price markers (hollow blue) — clipped to the zoomed range */}
        {markers.map((m, i) => m.target != null ? (
          <ReferenceDot key={`tg${i}`} x={epoch(m.date)} y={m.target} r={3.5}
            fill="#fff" stroke={BLUE} strokeWidth={1.6} ifOverflow="hidden" />
        ) : null)}

        {/* Recommendation markers (colored by direction) */}
        {markers.map((m, i) => m.price != null ? (
          <ReferenceDot key={`mk${i}`} x={epoch(m.date)} y={m.price} r={5.5}
            fill={DIR_META[m.direction].color} stroke="#fff" strokeWidth={1.8} ifOverflow="hidden" />
        ) : null)}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ── Metrics rail (right side) ───────────────────────────────────────────────────
function Metric({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div style={{ padding: "9px 11px", borderRadius: 9, background: "rgba(15,23,42,0.025)", border: `1px solid ${BORDER}` }}>
      <div style={{ fontSize: 9.5, fontWeight: 700, color: TEXT3, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 800, fontFamily: "JetBrains Mono, monospace", color: color ?? TEXT1, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: TEXT3, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function MetricsRail({ s, ccy, benchLabel }: { s: Summary; ccy: string; benchLabel: string }) {
  const sign = (v: number | null) => v == null ? TEXT3 : v >= 0 ? GREEN : RED;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* Hero: compound + alpha */}
      <div style={{ padding: "12px 14px", borderRadius: 11, background: "rgba(43,92,224,0.06)", border: "1px solid rgba(43,92,224,0.15)" }}>
        <div style={{ fontSize: 9.5, fontWeight: 700, color: BLUE, letterSpacing: "0.05em", textTransform: "uppercase" }}>Compound return ({ccy})</div>
        <div style={{ fontSize: 26, fontWeight: 800, fontFamily: "JetBrains Mono, monospace", color: sign(s.compound), lineHeight: 1.15 }}>{fmtPct(s.compound)}</div>
        <div style={{ fontSize: 11, color: TEXT2, marginTop: 2 }}>
          Alpha vs {benchLabel}: <span style={{ fontWeight: 700, color: sign(s.alpha), fontFamily: "JetBrains Mono, monospace" }}>{fmtPct(s.alpha)}</span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <Metric label="CAGR" value={fmtPct(s.cagr)} color={sign(s.cagr)} />
        <Metric label="Hit rate" value={s.hitRate == null ? "—" : `${s.hitRate.toFixed(0)}%`} sub={`${s.positions} positions`} />
        <Metric label="Best call" value={fmtPct(s.bestCall)} color={sign(s.bestCall)} />
        <Metric label="Worst call" value={fmtPct(s.worstCall)} color={sign(s.worstCall)} />
        <Metric label="Avg hold" value={s.avgHoldDays == null ? "—" : `${s.avgHoldDays}d`} />
        <Metric label="Time in mkt" value={s.timeInMarketPct == null ? "—" : `${s.timeInMarketPct.toFixed(0)}%`} />
      </div>

      <Metric label="Positions (L / S / Flat)" value={`${s.longs} / ${s.shorts} / ${s.flats}`} />

      {/* Current standing call */}
      <div style={{ padding: "10px 12px", borderRadius: 9, background: "rgba(15,23,42,0.025)", border: `1px solid ${BORDER}` }}>
        <div style={{ fontSize: 9.5, fontWeight: 700, color: TEXT3, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 4 }}>Current call</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <DirBadge d={s.lastDirection} />
          <span style={{ fontSize: 11, color: TEXT2 }}>Upside to target</span>
          <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 800, fontFamily: "JetBrains Mono, monospace", color: sign(s.impliedUpside) }}>{fmtPct(s.impliedUpside)}</span>
        </div>
        <div style={{ fontSize: 10.5, color: TEXT3, fontFamily: "JetBrains Mono, monospace" }}>
          target {fmtPrice(s.lastTarget)} · last {fmtPrice(s.lastPrice)}
        </div>
      </div>
    </div>
  );
}

const BENCHMARK_OPTIONS = [
  { value: "auto", label: "Auto (by market)" },
  { value: "SPY",  label: "S&P 500 (SPY)" },
  { value: "ACWI", label: "MSCI ACWI" },
  { value: "ILF",  label: "MSCI LatAm (ILF)" },
  { value: "ECH",  label: "MSCI Chile (ECH)" },
  { value: "EWZ",  label: "MSCI Brazil (EWZ)" },
  { value: "EWW",  label: "MSCI Mexico (EWW)" },
];

// ── Searchable combobox ─────────────────────────────────────────────────────────
function Combobox({
  value, onChange, options, placeholder, width = 180,
}: {
  value: string; onChange: (v: string) => void;
  options: string[]; placeholder: string; width?: number;
}) {
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return q ? options.filter(o => o.toLowerCase().includes(q)) : options;
  }, [options, query]);

  function select(v: string) {
    onChange(v);
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={ref} style={{ position: "relative", width }}>
      <input
        value={open ? query : value}
        placeholder={placeholder}
        onFocus={() => { setOpen(true); setQuery(""); }}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        style={{
          width: "100%", boxSizing: "border-box",
          padding: "6px 26px 6px 10px",
          borderRadius: 7, border: `1px solid ${BORDER}`,
          background: "#F8FAFF", fontSize: 12, color: TEXT1, outline: "none",
        }}
      />
      {value && (
        <button
          onMouseDown={e => { e.preventDefault(); select(""); }}
          style={{
            position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
            background: "none", border: "none", color: TEXT3, fontSize: 14,
            lineHeight: 1, cursor: "pointer", padding: 0,
          }}
        >
          ×
        </button>
      )}
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 50,
          maxHeight: 260, overflowY: "auto",
          background: "#FFFFFF", border: `1px solid ${BORDER}`, borderRadius: 8,
          boxShadow: "0 6px 20px rgba(15,23,42,0.12)",
        }}>
          <button
            onMouseDown={e => { e.preventDefault(); select(""); }}
            style={{
              width: "100%", textAlign: "left", padding: "7px 11px", border: "none",
              borderBottom: `1px solid ${BORDER}`, background: "transparent",
              fontSize: 12, color: TEXT3, cursor: "pointer", fontStyle: "italic",
            }}
          >
            All
          </button>
          {filtered.length === 0 ? (
            <div style={{ padding: "9px 11px", fontSize: 12, color: TEXT3 }}>No matches</div>
          ) : filtered.map(o => (
            <button
              key={o}
              onMouseDown={e => { e.preventDefault(); select(o); }}
              style={{
                width: "100%", textAlign: "left", padding: "7px 11px", border: "none",
                background: o === value ? "rgba(43,92,224,0.08)" : "transparent",
                fontSize: 12, color: o === value ? BLUE : TEXT1, cursor: "pointer",
                fontWeight: o === value ? 700 : 500,
              }}
              onMouseEnter={e => { if (o !== value) (e.currentTarget as HTMLElement).style.background = "rgba(15,23,42,0.03)"; }}
              onMouseLeave={e => { if (o !== value) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Field label wrapper ─────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: TEXT2, letterSpacing: "0.06em", textTransform: "uppercase" }}>
        {label}
      </span>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "6px 10px", borderRadius: 7, border: `1px solid ${BORDER}`,
  background: "#F8FAFF", fontSize: 12, color: TEXT1, outline: "none",
  fontFamily: "JetBrains Mono, monospace",
};

const TH: React.CSSProperties = {
  padding: "7px 10px", fontSize: 10, fontWeight: 700, color: TEXT2,
  textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap",
  borderBottom: `1px solid ${BORDER}`, background: "rgba(248,250,255,0.95)",
  position: "sticky", top: 0, zIndex: 2,
};
const TD: React.CSSProperties = {
  padding: "6px 10px", borderBottom: `1px solid ${BORDER}`, whiteSpace: "nowrap",
};
const MONO: React.CSSProperties = { fontFamily: "JetBrains Mono, monospace", fontSize: 11 };

// ── Main component ──────────────────────────────────────────────────────────────
export default function AnalystTrackRecord() {
  const [options, setOptions] = useState<TrackRecordOptions | null>(null);
  const [analystOptions, setAnalystOptions] = useState<string[]>([]);

  const [startDate, setStartDate] = useState("");
  const [endDate,   setEndDate]   = useState("");
  const [analyst,   setAnalyst]   = useState("");
  const [company,   setCompany]   = useState("");
  const [currency,  setCurrency]  = useState("USD");

  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [calc,        setCalc]        = useState<CalcPayload | null>(null);

  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingCalc,    setLoadingCalc]    = useState(false);
  const [error,          setError]          = useState<string | null>(null);
  const [touched,        setTouched]        = useState(false);
  const [showAdd,        setShowAdd]        = useState(false);
  const [benchmark,      setBenchmark]      = useState("auto");
  const [refreshKey,     setRefreshKey]     = useState(0);

  const calcMap = useMemo(() => new Map((calc?.rows ?? []).map(r => [r.id, r])), [calc]);

  // Load dropdown options + sensible date defaults (first post → today).
  useEffect(() => {
    fetch("/api/analysis/track-record/options")
      .then(r => r.json())
      .then((d: TrackRecordOptions) => {
        setOptions(d);
        setAnalystOptions(d.analysts);
        if (d.minDate) setStartDate(d.minDate);             // first post
        setEndDate(new Date().toISOString().slice(0, 10));  // today
      })
      .catch(() => setError("Failed to load filter options."));
  }, []);

  // Scope the analyst dropdown to the chosen company.
  useEffect(() => {
    if (!options) return;
    if (!company) { setAnalystOptions(options.analysts); return; }
    let cancelled = false;
    fetch(`/api/analysis/track-record/options?company=${encodeURIComponent(company)}`)
      .then(r => r.json())
      .then((d: TrackRecordOptions) => {
        if (cancelled) return;
        setAnalystOptions(d.analysts);
        setAnalyst(a => (a && !d.analysts.includes(a) ? "" : a));  // drop stale analyst
      })
      .catch(() => { if (!cancelled) setAnalystOptions(options.analysts); });
    return () => { cancelled = true; };
  }, [company, options]);

  // Auto-preview (DB only) — debounced on filter changes. Calc results become stale.
  useEffect(() => {
    if (!options) return;
    setTouched(true);
    setCalc(null);
    const handle = setTimeout(() => {
      const qs = new URLSearchParams();
      if (startDate) qs.set("startDate", startDate);
      if (endDate)   qs.set("endDate", endDate);
      if (analyst)   qs.set("analyst", analyst);
      if (company)   qs.set("company", company);
      setLoadingPreview(true);
      fetch(`/api/analysis/track-record?${qs.toString()}`)
        .then(r => r.json())
        .then((d: PreviewPayload) => setPreviewRows(d.rows ?? []))
        .catch(() => setPreviewRows([]))
        .finally(() => setLoadingPreview(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [options, startDate, endDate, analyst, company, refreshKey]);

  const calculate = useCallback(() => {
    if (!company) return;
    setError(null);
    setLoadingCalc(true);
    fetch("/api/analysis/track-record", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ startDate, endDate, analyst, company, currency, benchmark }),
    })
      .then(async r => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Calculation failed.");
        return d as CalcPayload;
      })
      .then(d => setCalc(d))
      .catch((e: Error) => { setError(e.message); setCalc(null); })
      .finally(() => setLoadingCalc(false));
  }, [startDate, endDate, analyst, company, currency, benchmark]);

  // Re-run the calculation when the benchmark changes (only if already calculated).
  useEffect(() => {
    if (calc) calculate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [benchmark]);

  // Refresh global option lists (companies/analysts/types) without touching dates.
  const reloadOptions = useCallback(() => {
    fetch("/api/analysis/track-record/options")
      .then(r => r.json())
      .then((d: TrackRecordOptions) => { setOptions(d); setAnalystOptions(d.analysts); })
      .catch(() => {});
  }, []);

  // After a successful insert: refresh options, focus the saved company, force a preview reload.
  const handleSaved = useCallback((savedCompany: string) => {
    setShowAdd(false);
    reloadOptions();
    setAnalyst("");
    setCompany(savedCompany);
    setRefreshKey(k => k + 1);
  }, [reloadOptions]);

  const hasCalc = calcMap.size > 0;

  // Calculated rows joined to their preview row, in date order (matches the table).
  const chartData = useMemo<ChartPoint[]>(() => {
    const out: ChartPoint[] = [];
    for (const r of previewRows) {
      const c = calcMap.get(r.id);
      if (c) out.push({ ...c, rec: r.recommendation, label: fmtShort(c.entryDate) });
    }
    return out;
  }, [previewRows, calcMap]);

  const summary  = calc?.summary ?? null;
  const benchLbl = calc?.benchmark?.label ?? "Benchmark";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* ── Filter panel ──────────────────────────────────────────────────────── */}
      <div style={{
        background: "#FFFFFF", border: `1px solid ${BORDER}`, borderRadius: 12,
        boxShadow: "0 1px 4px rgba(15,23,42,0.06)", padding: "16px 18px",
        display: "flex", alignItems: "flex-end", gap: 14, flexWrap: "wrap",
      }}>
        <Field label="Start date">
          <input type="date" value={startDate} max={endDate || undefined}
            onChange={e => setStartDate(e.target.value)} style={inputStyle} />
        </Field>
        <Field label="End date">
          <input type="date" value={endDate} min={startDate || undefined}
            onChange={e => setEndDate(e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Company">
          <Combobox value={company} onChange={setCompany}
            options={options?.companies ?? []} placeholder="All companies" width={210} />
        </Field>
        <Field label="Analyst">
          <Combobox value={analyst} onChange={setAnalyst}
            options={analystOptions}
            placeholder={company ? "All analysts (company)" : "All analysts"} width={190} />
        </Field>
        <Field label="Currency">
          <select value={currency} onChange={e => setCurrency(e.target.value)}
            style={{ ...inputStyle, cursor: "pointer", minWidth: 92 }}>
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>

        <div style={{ flex: 1 }} />

        <button
          onClick={() => setShowAdd(true)}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "9px 16px", borderRadius: 8,
            border: `1px solid rgba(43,92,224,0.30)`, background: "rgba(43,92,224,0.06)",
            color: BLUE, fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap", cursor: "pointer",
          }}
        >
          + Add recommendation
        </button>

        <button
          onClick={calculate}
          disabled={!company || loadingCalc}
          title={!company ? "Select a company to calculate" : undefined}
          style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "9px 18px", borderRadius: 8, border: "none",
            fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap",
            color: "#FFFFFF",
            background: !company || loadingCalc ? "rgba(43,92,224,0.40)" : BLUE,
            cursor: !company || loadingCalc ? "not-allowed" : "pointer",
            boxShadow: !company || loadingCalc ? "none" : "0 1px 3px rgba(43,92,224,0.35)",
          }}
        >
          {loadingCalc && (
            <span style={{
              width: 13, height: 13, borderRadius: "50%",
              border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "#FFFFFF",
              animation: "spin 0.8s linear infinite",
            }} />
          )}
          {loadingCalc ? "Calculating…" : "Calculate Track Record"}
        </button>
      </div>

      {/* ── Error banner ──────────────────────────────────────────────────────── */}
      {error && (
        <div style={{
          padding: "10px 14px", borderRadius: 8, fontSize: 12, color: RED,
          background: "rgba(185,28,28,0.06)", border: "1px solid rgba(185,28,28,0.20)",
        }}>
          {error}
        </div>
      )}

      {/* ── Charts + metrics rail (after Calculate) ───────────────────────────── */}
      {hasCalc && summary && calc && (
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
          {/* LEFT: charts */}
          <div style={{ flex: 1, minWidth: 340, display: "flex", flexDirection: "column", gap: 14 }}>

            {/* Equity curve (hero) */}
            <div style={{ background: "#FFFFFF", border: `1px solid ${BORDER}`, borderRadius: 12, boxShadow: "0 1px 4px rgba(15,23,42,0.06)", padding: "14px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: TEXT1 }}>
                    Equity curve — strategy vs benchmark <span style={{ color: TEXT3, fontWeight: 500 }}>({calc.targetCurrency})</span>
                  </span>
                  <InfoTip content={<Method
                    what="compara cuánto ganó/perdió seguir al analista vs comprar y mantener el mercado."
                    how="compuesto diario de los retornos direccionales; benchmark = buy&hold del índice/ETF."
                    value="¿genera alpha? (alpha = estrategia − benchmark)." />} />
                </div>
                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <LegendDot color={BLUE} label="Strategy" line />
                  <LegendDot color="#94A3B8" label={benchLbl} line />
                  <LegendDot color={GREEN} label="Ahead" />
                  <LegendDot color={RED} label="Behind" />
                  <select value={benchmark} onChange={e => setBenchmark(e.target.value)}
                    style={{ padding: "5px 8px", borderRadius: 7, border: `1px solid ${BORDER}`, background: "#F8FAFF", fontSize: 11, color: TEXT1, cursor: "pointer", outline: "none" }}>
                    {BENCHMARK_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
              <EquityChart data={calc.equityCurve ?? []} benchLabel={benchLbl} />
            </div>

            {/* Price with points */}
            <div style={{ background: "#FFFFFF", border: `1px solid ${BORDER}`, borderRadius: 12, boxShadow: "0 1px 4px rgba(15,23,42,0.06)", padding: "14px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: TEXT1 }}>
                    Price, recommendations &amp; targets <span style={{ color: TEXT3, fontWeight: 500 }}>({calc.nativeCurrency || "local"})</span>
                  </span>
                  <InfoTip content={<Method
                    what="dibuja el precio real con un punto en cada call (▲ compra / ▼ venta) y su target."
                    how="precio ajustado; franjas verde/roja marcan cuándo estuvo long/short."
                    value="timing visual — ¿compró barato y vendió caro?" />} />
                </div>
                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <LegendDot color={GREEN} label="Buy" />
                  <LegendDot color={RED} label="Sell" />
                  <LegendDot color={TEXT3} label="Hold" />
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, color: TEXT2 }}>
                    <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#fff", border: `1.4px solid ${BLUE}` }} /> Target
                  </span>
                </div>
              </div>
              <PriceChart priceLine={calc.priceLine ?? []} markers={calc.markers ?? []} rows={calc.rows} ccy={calc.nativeCurrency || "local"} />
            </div>

            {/* Per-recommendation bars (secondary) */}
            <div style={{ background: "#FFFFFF", border: `1px solid ${BORDER}`, borderRadius: 12, boxShadow: "0 1px 4px rgba(15,23,42,0.06)", padding: "14px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: TEXT1 }}>Per-recommendation return</span>
                  <InfoTip content={<Method
                    what="el resultado de cada call individual (verde gana / roja pierde) + línea de acumulado."
                    how="retorno direccional de cada tramo entry→exit."
                    value="consistencia y hit-rate — ¿le pega seguido o vive de un acierto?" />} />
                </div>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <LegendDot color={GREEN} label="Gain" />
                  <LegendDot color={RED} label="Loss" />
                  <LegendDot color={BLUE} label="Compound" line />
                </div>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <ComposedChart data={chartData} margin={{ top: 6, right: 6, bottom: 0, left: -8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.05)" vertical={false} />
                  <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={20} />
                  <YAxis yAxisId="ret" tick={axisTick} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} width={46} />
                  <YAxis yAxisId="cmp" orientation="right" tick={{ ...axisTick, fill: BLUE }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} width={48} />
                  <ReferenceLine yAxisId="ret" y={0} stroke="rgba(15,23,42,0.25)" />
                  <Tooltip cursor={{ fill: "rgba(43,92,224,0.05)" }} content={(p) => <BarTooltip active={p.active} payload={p.payload as unknown as { payload: ChartPoint }[]} />} />
                  <Bar yAxisId="ret" dataKey="periodReturn" radius={[2, 2, 0, 0]} maxBarSize={36} isAnimationActive={false}>
                    {chartData.map((d, i) => (<Cell key={i} fill={d.direction === "flat" ? "#CBD5E1" : (d.periodReturn ?? 0) >= 0 ? GREEN : RED} />))}
                  </Bar>
                  <Line yAxisId="cmp" type="monotone" dataKey="compound" stroke={BLUE} strokeWidth={2} dot={false} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* RIGHT: metrics rail */}
          <div style={{ width: 250, flexShrink: 0 }}>
            <MetricsRail s={summary} ccy={calc.targetCurrency} benchLabel={benchLbl} />
          </div>
        </div>
      )}

      {/* ── Results table ─────────────────────────────────────────────────────── */}
      <div style={{
        background: "#FFFFFF", border: `1px solid ${BORDER}`, borderRadius: 12,
        overflow: "hidden", boxShadow: "0 1px 4px rgba(15,23,42,0.06)",
      }}>
        {/* Results header strip */}
        <div style={{
          padding: "10px 16px", borderBottom: `1px solid ${BORDER}`,
          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
          background: "rgba(248,250,255,0.6)",
        }}>
          <span style={{ fontSize: 11, color: TEXT2, fontWeight: 600 }}>
            {previewRows.length} recommendation{previewRows.length !== 1 ? "s" : ""}
          </span>
          {loadingPreview && (
            <span style={{
              width: 13, height: 13, borderRadius: "50%",
              border: "2px solid rgba(43,92,224,0.18)", borderTopColor: BLUE,
              animation: "spin 0.8s linear infinite",
            }} />
          )}
          <div style={{ flex: 1 }} />
          {hasCalc && calc && (
            <span style={{ ...MONO, color: TEXT3 }}>
              {calc.ticker} · {calc.nativeCurrency || "—"} → {calc.targetCurrency || "—"}
            </span>
          )}
          {!hasCalc && (
            <span style={{ fontSize: 10, color: TEXT3, fontStyle: "italic" }}>
              Select a company and run to compute charts
            </span>
          )}
        </div>

        <div style={{ overflowX: "auto", maxHeight: 600 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ ...TH, textAlign: "left" }}>Date</th>
                <th style={{ ...TH, textAlign: "left" }}>Type</th>
                <th style={{ ...TH, textAlign: "left" }}>Analyst</th>
                <th style={{ ...TH, textAlign: "left" }}>Company</th>
                <th style={{ ...TH, textAlign: "left" }}>Rec.</th>
                <th style={{ ...TH, textAlign: "right" }}>Target Price</th>
                <th style={{ ...TH, textAlign: "right", borderLeft: `2px solid rgba(43,92,224,0.22)` }}>Entry (Adj)</th>
                <th style={{ ...TH, textAlign: "right" }}>Exit (Adj)</th>
                <th style={{ ...TH, textAlign: "center" }}>Pos</th>
                <th style={{ ...TH, textAlign: "right" }}>Return %</th>
                <th style={{ ...TH, textAlign: "right" }}>Compound %</th>
              </tr>
            </thead>
            <tbody>
              {previewRows.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ textAlign: "center", padding: "44px 0", color: TEXT3, fontSize: 13 }}>
                    {loadingPreview ? "Loading…" : touched ? "No recommendations for this filter" : "Adjust the filters above to preview recommendations"}
                  </td>
                </tr>
              ) : previewRows.map((row, idx) => {
                const c = calcMap.get(row.id);
                return (
                  <tr key={row.id} style={{ background: idx % 2 === 0 ? "#FFFFFF" : "rgba(248,250,255,0.5)" }}>
                    <td style={{ ...TD, ...MONO, color: TEXT2 }}>{fmtDate(row.date)}</td>
                    <td style={{ ...TD, fontSize: 11, color: TEXT2 }}>{row.type}</td>
                    <td style={{ ...TD, fontSize: 11, fontWeight: 600, color: TEXT1 }}>{row.analyst}</td>
                    <td style={{ ...TD, fontSize: 11, color: TEXT1, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{row.company}</td>
                    <td style={{ ...TD }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, color: recColor(row.recommendation),
                        padding: "2px 7px", borderRadius: 4, background: "rgba(15,23,42,0.04)",
                        border: `1px solid ${BORDER}`,
                      }}>
                        {row.recommendation}
                      </span>
                    </td>
                    <td style={{ ...TD, ...MONO, textAlign: "right", color: TEXT1, fontWeight: 600 }}>{fmtPrice(row.targetPrice)}</td>

                    <td style={{ ...TD, ...MONO, textAlign: "right", color: TEXT1, borderLeft: `2px solid rgba(43,92,224,0.22)` }}>
                      {c ? fmtPrice(c.entryPrice) : <span style={{ color: TEXT3 }}>—</span>}
                    </td>
                    <td style={{ ...TD, ...MONO, textAlign: "right", color: TEXT1 }}>
                      {c ? fmtPrice(c.exitPrice) : <span style={{ color: TEXT3 }}>—</span>}
                    </td>
                    <td style={{ ...TD, textAlign: "center" }}>
                      {c ? <DirBadge d={c.direction} /> : <span style={{ color: TEXT3 }}>—</span>}
                    </td>
                    <td style={{ ...TD, ...MONO, textAlign: "right", fontWeight: 700,
                      color: !c || c.periodReturn == null || c.direction === "flat" ? TEXT3 : c.periodReturn >= 0 ? GREEN : RED }}>
                      {!c ? "—" : c.direction === "flat" ? "Flat" : fmtPct(c.periodReturn)}
                    </td>
                    <td style={{ ...TD, ...MONO, textAlign: "right", fontWeight: 700,
                      color: !c || c.compound == null ? TEXT3 : c.compound >= 0 ? GREEN : RED }}>
                      {!c ? "—" : fmtPct(c.compound)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <AddRecommendationModal
        open={showAdd}
        options={options}
        onClose={() => setShowAdd(false)}
        onSaved={handleSaved}
      />
    </div>
  );
}
