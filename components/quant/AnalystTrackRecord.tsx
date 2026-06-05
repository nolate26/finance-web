"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  ComposedChart, Bar, Line, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer,
} from "recharts";
import type { TrackRecordOptions } from "@/app/api/analysis/track-record/options/route";
import type { PreviewRow, CalcRow, PreviewPayload, CalcPayload } from "@/app/api/analysis/track-record/route";

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

function Stat({ label, value, accent, valueColor }: {
  label: string; value: string | number; accent?: boolean; valueColor?: string;
}) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 6,
      background: accent ? "rgba(43,92,224,0.07)" : "rgba(15,23,42,0.04)",
      border: `1px solid ${accent ? "rgba(43,92,224,0.15)" : BORDER}`,
    }}>
      <span style={{ fontSize: 9.5, color: accent ? BLUE : TEXT2, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>{label}</span>
      <span style={{ fontSize: 11, fontWeight: 700, color: valueColor ?? (accent ? BLUE : TEXT1), fontFamily: "JetBrains Mono, monospace" }}>{value}</span>
    </span>
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
  const [calcMap,     setCalcMap]     = useState<Map<number, CalcRow>>(new Map());
  const [calcMeta,    setCalcMeta]    = useState<{ ticker: string; nativeCurrency: string; targetCurrency: string } | null>(null);

  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingCalc,    setLoadingCalc]    = useState(false);
  const [error,          setError]          = useState<string | null>(null);
  const [touched,        setTouched]        = useState(false);

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
    setCalcMap(new Map());
    setCalcMeta(null);
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
  }, [options, startDate, endDate, analyst, company]);

  const calculate = useCallback(() => {
    if (!company) return;
    setError(null);
    setLoadingCalc(true);
    fetch("/api/analysis/track-record", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ startDate, endDate, analyst, company, currency }),
    })
      .then(async r => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Calculation failed.");
        return d as CalcPayload;
      })
      .then(d => {
        setCalcMap(new Map(d.rows.map(row => [row.id, row])));
        setCalcMeta({ ticker: d.ticker, nativeCurrency: d.nativeCurrency, targetCurrency: d.targetCurrency });
      })
      .catch((e: Error) => { setError(e.message); setCalcMap(new Map()); setCalcMeta(null); })
      .finally(() => setLoadingCalc(false));
  }, [startDate, endDate, analyst, company, currency]);

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

  const summary = useMemo(() => {
    if (chartData.length === 0) return null;
    const pos  = chartData.filter(d => d.direction !== "flat" && d.periodReturn != null);
    const wins = pos.filter(d => (d.periodReturn ?? 0) > 0).length;
    return {
      totalCompound: chartData[chartData.length - 1].compound,
      positions:     pos.length,
      hitRate:       pos.length ? (wins / pos.length) * 100 : null,
    };
  }, [chartData]);

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

      {/* ── Chart: per-recommendation return (bars) + compounding (line) ───────── */}
      {chartData.length > 0 && (
        <div style={{
          background: "#FFFFFF", border: `1px solid ${BORDER}`, borderRadius: 12,
          boxShadow: "0 1px 4px rgba(15,23,42,0.06)", padding: "16px 18px",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: TEXT1 }}>
              Per-recommendation return &amp; compounding
            </span>
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <LegendDot color={GREEN} label="Gain" />
              <LegendDot color={RED} label="Loss" />
              <LegendDot color={BLUE} label="Compound" line />
            </div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={chartData} margin={{ top: 6, right: 6, bottom: 0, left: -8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.05)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: TEXT3, fontSize: 10, fontFamily: "JetBrains Mono, monospace" }}
                tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={20}
              />
              <YAxis
                yAxisId="ret"
                tick={{ fill: TEXT3, fontSize: 10, fontFamily: "JetBrains Mono, monospace" }}
                tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} width={46}
              />
              <YAxis
                yAxisId="cmp" orientation="right"
                tick={{ fill: BLUE, fontSize: 10, fontFamily: "JetBrains Mono, monospace" }}
                tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} width={48}
              />
              <ReferenceLine yAxisId="ret" y={0} stroke="rgba(15,23,42,0.25)" />
              <Tooltip
                cursor={{ fill: "rgba(43,92,224,0.05)" }}
                content={(p) => <BarTooltip active={p.active} payload={p.payload as unknown as { payload: ChartPoint }[]} />}
              />
              <Bar yAxisId="ret" dataKey="periodReturn" radius={[2, 2, 0, 0]} maxBarSize={36} isAnimationActive={false}>
                {chartData.map((d, i) => (
                  <Cell key={i} fill={d.direction === "flat" ? "#CBD5E1" : (d.periodReturn ?? 0) >= 0 ? GREEN : RED} />
                ))}
              </Bar>
              <Line yAxisId="cmp" type="monotone" dataKey="compound" stroke={BLUE} strokeWidth={2} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
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
          {summary && (
            <>
              <Stat label="Compound" value={fmtPct(summary.totalCompound)}
                valueColor={(summary.totalCompound ?? 0) >= 0 ? GREEN : RED} accent />
              <Stat label="Positions" value={summary.positions} />
              {summary.hitRate != null && <Stat label="Hit rate" value={`${summary.hitRate.toFixed(0)}%`} />}
            </>
          )}
          <div style={{ flex: 1 }} />
          {calcMeta && (
            <span style={{ ...MONO, color: TEXT3 }}>
              {calcMeta.ticker} · {calcMeta.nativeCurrency || "—"} → {calcMeta.targetCurrency || "—"}
            </span>
          )}
          {!hasCalc && (
            <span style={{ fontSize: 10, color: TEXT3, fontStyle: "italic" }}>
              Select a company and run to compute returns
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
    </div>
  );
}
