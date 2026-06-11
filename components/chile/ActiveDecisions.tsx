"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { RefreshCw, TrendingDown, TrendingUp, Minus, RotateCcw } from "lucide-react";
import type { ADCompany, ADBand, ActiveDecisionsPayload } from "@/app/api/chile/active-decisions/route";

// ── Tokens ───────────────────────────────────────────────────────────────────
const TEXT1 = "#0F172A";
const TEXT2 = "#64748B";
const TEXT3 = "#94A3B8";
const BORDER = "rgba(15,23,42,0.08)";
const BLUE   = "#2B5CE0";
const GREEN  = "#15803D";
const RED    = "#B91C1C";
const GREY   = "#64748B";

// consensus_estimates NET_INCOME / EBITDA vienen en MILLONES de la moneda de reporte.
const NI_SCALE = 1e6;
// ss_universe.net_debt viene en CLP mil-millones (positivo = deuda, negativo = caja).
const NETDEBT_SCALE = 1e9;
// Si precio/implícito(asumiendo CLP) supera esto ⇒ el NI estaba en USD (≈ USDCLP).
const USD_DETECT_RATIO = 50;

type Metric  = "pe" | "ev";
type SortKey = "name" | "gics" | "current" | "position" | "mult" | "ni" | "netDebt" | "shares" | "implied";
type Band3   = { lower?: string; avg?: string; upper?: string };

// ── Format helpers ──────────────────────────────────────────────────────────────
const fmt1   = (v: number) => v.toFixed(1);
const fmtMult = (v?: number | null) => (v == null || !isFinite(v) ? "—" : v.toFixed(1) + "x");
const fmtCLP  = (v?: number | null) => (v == null || !isFinite(v) ? "—" : v.toLocaleString("es-CL", { maximumFractionDigits: v >= 100 ? 0 : 1 }));
const fmtMM   = (v?: number | null) => (v == null || !isFinite(v) ? "—" : v.toLocaleString("es-CL", { maximumFractionDigits: 0 }));
const fmtBn   = (v?: number | null) => (v == null || !isFinite(v) ? "—" : v.toLocaleString("es-CL", { maximumFractionDigits: 1 }));
const fmtSh   = (v?: number | null) => (v == null || !isFinite(v) ? "—" : (v / 1e6).toLocaleString("es-CL", { maximumFractionDigits: 1 }) + " M");
const numOr   = (s: string | undefined, fb: number) => {
  if (s == null || s.trim() === "") return fb;
  const v = parseFloat(s.replace(",", "."));
  return isFinite(v) ? v : fb;
};

// ── Computed row ────────────────────────────────────────────────────────────────
interface Row extends ADCompany {
  band:       ADBand;                       // banda numérica vigente (editada o calculada)
  vals:       { lower: string; avg: string; upper: string }; // strings para los inputs
  edited:     boolean;
  eps:        number | null;                // utilidad por acción (CLP)
  niCurrency: "CLP" | "USD" | null;
  implied:    { low: number; mid: number; high: number } | null;
  signal:     "below" | "in" | "above" | null;
  position:   number | null;
}

// ── "Where are we" gauge ────────────────────────────────────────────────────────
function Gauge({ low, mid, high, current, signal }: {
  low: number; mid: number; high: number; current: number; signal: "below" | "in" | "above";
}) {
  const span = Math.max(high - low, 1e-9);
  const min = low - span * 0.6, max = high + span * 0.6;
  const pct = (x: number) => Math.max(0, Math.min(100, ((x - min) / (max - min)) * 100));
  const color = signal === "below" ? GREEN : signal === "above" ? RED : GREY;
  return (
    <div style={{ position: "relative", height: 22, width: "100%", minWidth: 140 }}>
      <div style={{ position: "absolute", top: 9, left: 0, right: 0, height: 4, borderRadius: 2, background: "rgba(15,23,42,0.06)" }} />
      <div style={{ position: "absolute", top: 8, height: 6, borderRadius: 3, left: `${pct(low)}%`, width: `${pct(high) - pct(low)}%`, background: "rgba(43,92,224,0.16)", border: "1px solid rgba(43,92,224,0.28)" }} />
      <div style={{ position: "absolute", top: 5, height: 12, width: 1, background: TEXT3, left: `${pct(mid)}%` }} />
      <div style={{ position: "absolute", top: 2, height: 18, width: 3, borderRadius: 2, background: color, left: `calc(${pct(current)}% - 1.5px)`, boxShadow: `0 0 0 2px ${color}22` }} />
    </div>
  );
}

function SignalBadge({ signal }: { signal: Row["signal"] }) {
  if (!signal) return <span style={{ color: TEXT3, fontSize: 11 }}>—</span>;
  const cfg = signal === "below"
    ? { label: "Below band", color: GREEN, Icon: TrendingDown }
    : signal === "above"
    ? { label: "Above band", color: RED, Icon: TrendingUp }
    : { label: "In range", color: GREY, Icon: Minus };
  const { label, color, Icon } = cfg;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 5, color, background: `${color}12`, border: `1px solid ${color}2e`, whiteSpace: "nowrap" }}>
      <Icon size={11} /> {label}
    </span>
  );
}

// ── Editable multiple band (low / avg / high) — acepta cualquier número ─────────
function BandEdit({ band, vals, editable, edited, onChange, onReset }: {
  band: ADBand; vals: { lower: string; avg: string; upper: string }; editable: boolean; edited: boolean;
  onChange: (f: keyof Band3, v: string) => void; onReset: () => void;
}) {
  if (!editable) {
    return (
      <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11.5 }}>
        <span>{fmtMult(band.lower)} <span style={{ color: TEXT3 }}>/</span> <strong>{fmtMult(band.avg)}</strong> <span style={{ color: TEXT3 }}>/</span> {fmtMult(band.upper)}</span>
        <div style={{ fontSize: 10, color: TEXT3 }}>n={band.n}</div>
      </div>
    );
  }
  const inp = (f: keyof Band3) => (
    <input type="text" inputMode="decimal" value={vals[f as "lower" | "avg" | "upper"]}
      onChange={(e) => onChange(f, e.target.value)}
      style={{ width: 48, padding: "2px 4px", fontSize: 11, fontFamily: "JetBrains Mono, monospace", textAlign: "center",
        border: `1px solid ${edited ? "rgba(43,92,224,0.45)" : BORDER}`, borderRadius: 5,
        background: edited ? "rgba(43,92,224,0.05)" : "#fff", color: TEXT1, outline: "none" }} />
  );
  return (
    <div>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
        {inp("lower")} <span style={{ color: TEXT3 }}>/</span> {inp("avg")} <span style={{ color: TEXT3 }}>/</span> {inp("upper")}
        {edited && (
          <button onClick={onReset} title="Reset al calculado" style={{ marginLeft: 2, border: "none", background: "transparent", cursor: "pointer", color: TEXT3, display: "inline-flex" }}>
            <RotateCcw size={12} />
          </button>
        )}
      </div>
      <div style={{ fontSize: 10, color: TEXT3, marginTop: 2 }}>n={band.n} · low/avg/high{edited ? " · editado" : ""}</div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ActiveDecisions() {
  const [data,          setData]          = useState<ActiveDecisionsPayload | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState(false);
  const [pricesLoading, setPricesLoading] = useState(false);
  const [metric,        setMetric]        = useState<Metric>("pe");
  const [gicsFilter,    setGicsFilter]    = useState<string>("all");
  const [sortKey,       setSortKey]       = useState<SortKey>("position");
  const [sortDir,       setSortDir]       = useState<"asc" | "desc">("desc");
  const [overrides,     setOverrides]     = useState<Record<string, Band3>>({});

  const load = useCallback((withPrices: boolean) => {
    if (withPrices) setPricesLoading(true); else setLoading(true);
    setError(false);
    fetch(`/api/chile/active-decisions${withPrices ? "?withPrices=true" : ""}`)
      .then((r) => r.json())
      .then((d: ActiveDecisionsPayload & { error?: string }) => { d.error ? setError(true) : setData(d); })
      .catch(() => setError(true))
      .finally(() => { setLoading(false); setPricesLoading(false); });
  }, []);
  useEffect(() => { load(false); }, [load]);

  const priced = data?.withPrices ?? false;
  const usdClp = data?.usdClp ?? null;

  const gicsOptions = useMemo(() => {
    const set = new Set<string>();
    for (const c of data?.companies ?? []) {
      const b = metric === "pe" ? c.pe : c.evEbitda;
      if (b && c.gics) set.add(c.gics);
    }
    return Array.from(set).sort();
  }, [data, metric]);

  const rows = useMemo<Row[]>(() => {
    const list: Row[] = [];
    for (const co of data?.companies ?? []) {
      const baseBand = metric === "pe" ? co.pe : co.evEbitda;
      if (!baseBand) continue;
      if (gicsFilter !== "all" && co.gics !== gicsFilter) continue;

      const key = `${metric}|${co.ticker}`;
      const ov = overrides[key];
      const edited = !!ov && (ov.lower != null || ov.avg != null || ov.upper != null);
      const band: ADBand = {
        lower: numOr(ov?.lower, baseBand.lower),
        avg:   numOr(ov?.avg,   baseBand.avg),
        upper: numOr(ov?.upper, baseBand.upper),
        n:     baseBand.n,
      };
      const vals = {
        lower: ov?.lower ?? fmt1(baseBand.lower),
        avg:   ov?.avg   ?? fmt1(baseBand.avg),
        upper: ov?.upper ?? fmt1(baseBand.upper),
      };

      let eps: number | null = null;
      let niCurrency: Row["niCurrency"] = null;
      let implied: Row["implied"] = null;
      let signal: Row["signal"] = null;
      let position: number | null = null;

      // Moneda del reporte (consenso): se detecta SIEMPRE desde NET_INCOME + P/E e
      // independiente de la métrica activa, para que P/E y EV/EBITDA usen la misma.
      if (co.pe && co.netIncome != null && co.netIncome > 0 && co.shares && co.currentPrice != null && usdClp != null) {
        const midBase = co.pe.avg * ((co.netIncome * NI_SCALE) / co.shares);
        niCurrency = midBase > 0 && co.currentPrice / midBase > USD_DETECT_RATIO ? "USD" : "CLP";
      }
      const fx = niCurrency === "USD" ? (usdClp as number) : 1;

      // Precio implícito (necesita precio + acciones + banda con low > 0).
      if (co.shares && co.currentPrice != null && band.lower > 0 && band.upper > band.lower) {
        let low: number | null = null, mid: number | null = null, high: number | null = null;
        if (metric === "pe" && co.netIncome != null && co.netIncome > 0) {
          eps = (co.netIncome * NI_SCALE * fx) / co.shares;            // utilidad por acción (CLP)
          low = band.lower * eps; mid = band.avg * eps; high = band.upper * eps;
        } else if (metric === "ev" && co.ebitda != null && co.ebitda > 0 && co.netDebt != null) {
          const ebitdaCLP = co.ebitda * NI_SCALE * fx;                 // consenso → CLP absoluto
          const ndCLP = co.netDebt * NETDEBT_SCALE;                    // ss_universe (CLP)
          const px = (m: number) => (m * ebitdaCLP - ndCLP) / co.shares!;  // (EV − deuda) / acciones
          low = px(band.lower); mid = px(band.avg); high = px(band.upper);
        }
        if (low != null && mid != null && high != null && high > low && low > 0) {
          implied = { low, mid, high };
          signal = co.currentPrice < low ? "below" : co.currentPrice > high ? "above" : "in";
          position = (co.currentPrice - low) / (high - low);
        }
      }
      list.push({ ...co, band, vals, edited, eps, niCurrency, implied, signal, position });
    }

    const val = (r: Row): number | string | null => {
      switch (sortKey) {
        case "name":     return r.name;
        case "gics":     return r.gics ?? "";
        case "current":  return r.currentPrice ?? null;
        case "position": return r.position ?? null;
        case "mult":     return r.band.avg;
        case "ni":       return metric === "pe" ? r.netIncome : r.ebitda;
        case "netDebt":  return r.netDebt ?? null;
        case "shares":   return r.shares ?? null;
        case "implied":  return r.implied?.mid ?? null;
        default:         return null;
      }
    };
    list.sort((a, b) => {
      const av = val(a), bv = val(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = typeof av === "string" && typeof bv === "string" ? av.localeCompare(bv) : (av as number) - (bv as number);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [data, metric, gicsFilter, overrides, sortKey, sortDir, usdClp]);

  const setBandField = (co: ADCompany, field: keyof Band3, v: string) => {
    const key = `${metric}|${co.ticker}`;
    setOverrides((prev) => ({ ...prev, [key]: { ...(prev[key] ?? {}), [field]: v } }));
  };
  const resetBand = (co: ADCompany) => {
    const key = `${metric}|${co.ticker}`;
    setOverrides((prev) => { const next = { ...prev }; delete next[key]; return next; });
  };
  const sortBy = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir(k === "name" || k === "gics" ? "asc" : "desc"); }
  };

  if (loading) {
    return <div className="flex items-center justify-center" style={{ padding: 60 }}>
      <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: "rgba(43,92,224,0.15)", borderTopColor: BLUE }} /></div>;
  }
  if (error || !data) {
    return <div style={{ textAlign: "center", padding: 40, color: TEXT3, fontSize: 13 }}>
      Failed to load active-decisions data.
      <div><button onClick={() => load(false)} style={retryBtn}>Retry</button></div></div>;
  }

  const metricLabel = metric === "pe" ? "P/E" : "EV/EBITDA";

  return (
    <div>
      {/* ── Header / controls ─────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ maxWidth: 720 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 3, height: 22, background: BLUE, borderRadius: 2 }} />
            <h2 style={{ fontSize: 16, fontWeight: 700, color: TEXT1, letterSpacing: "-0.02em", margin: 0 }}>Active Decisions</h2>
          </div>
          <p style={{ fontSize: 12, color: TEXT2, margin: "4px 0 0 13px", lineHeight: 1.5 }}>
            <strong>Metodología:</strong>{" "}
            {metric === "pe"
              ? <>precio implícito = <strong>P/E</strong> × (NET_INCOME / acciones), con NET_INCOME del consenso (año forward).</>
              : <>precio implícito = (<strong>EV/EBITDA</strong> × EBITDA − Deuda Neta) / acciones, con EBITDA del consenso y deuda neta de ss_universe.</>}
            {" "}Comparamos el precio actual contra la banda <strong>±1σ</strong> del múltiplo histórico forward (10A).
            {data.asOf ? ` Valuación al ${data.asOf}.` : ""}{priced && usdClp ? ` USDCLP ${usdClp.toFixed(0)}.` : ""}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <select value={gicsFilter} onChange={(e) => setGicsFilter(e.target.value)}
            style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${BORDER}`, background: "#F8FAFF", fontSize: 12, color: gicsFilter === "all" ? TEXT2 : TEXT1, cursor: "pointer", outline: "none", maxWidth: 200 }}>
            <option value="all">Todas las industrias (GICS)</option>
            {gicsOptions.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <div style={{ display: "inline-flex", background: "rgba(15,23,42,0.04)", border: `1px solid ${BORDER}`, borderRadius: 9, padding: 3 }}>
            {([["pe", "P/E"], ["ev", "EV/EBITDA"]] as [Metric, string][]).map(([k, label]) => {
              const active = metric === k;
              return <button key={k} onClick={() => setMetric(k)}
                style={{ padding: "5px 13px", fontSize: 11.5, fontWeight: active ? 700 : 600, color: active ? "#fff" : TEXT2, background: active ? BLUE : "transparent", border: "none", borderRadius: 7, cursor: "pointer" }}>{label}</button>;
            })}
          </div>
          <button onClick={() => load(true)} disabled={pricesLoading}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: pricesLoading ? "default" : "pointer", color: "#fff", background: BLUE, border: "none", opacity: pricesLoading ? 0.7 : 1, boxShadow: "0 1px 3px rgba(43,92,224,0.30)" }}>
            <RefreshCw size={13} style={pricesLoading ? { animation: "spin 0.8s linear infinite" } : undefined} />
            {pricesLoading ? "Fetching…" : priced ? "Refresh prices" : "Fetch current prices"}
          </button>
        </div>
      </div>

      {!priced && <div style={{ fontSize: 11.5, color: TEXT2, marginBottom: 10 }}>Apreta <strong>Fetch current prices</strong> para traer precio y acciones (Yahoo) y ver el precio implícito y dónde estamos.</div>}

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      <div style={{ overflowX: "auto", border: `1px solid ${BORDER}`, borderRadius: 12, boxShadow: "0 1px 4px rgba(15,23,42,0.06)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 1120 }}>
          <thead>
            <tr style={{ background: "rgba(248,250,255,0.95)" }}>
              <Th label="Company"      k="name"     {...{ sortKey, sortDir, sortBy }} align="left" />
              <Th label="GICS"         k="gics"     {...{ sortKey, sortDir, sortBy }} align="left" />
              <Th label="Current"      k="current"  {...{ sortKey, sortDir, sortBy }} align="right" />
              <Th label="Where are we" k="position" {...{ sortKey, sortDir, sortBy }} align="left" />
              <Th label={`${metricLabel} band (×)`} k="mult" {...{ sortKey, sortDir, sortBy }} align="left" />
              {metric === "pe" ? (
                <Th label="Utilidad NI (MM)" k="ni" {...{ sortKey, sortDir, sortBy }} align="right" />
              ) : (
                <>
                  <Th label="EBITDA (MM)" k="ni" {...{ sortKey, sortDir, sortBy }} align="right" />
                  <Th label="Deuda Neta (CLP bn)" k="netDebt" {...{ sortKey, sortDir, sortBy }} align="right" />
                </>
              )}
              <Th label="Acciones"     k="shares"   {...{ sortKey, sortDir, sortBy }} align="right" />
              <Th label="Implied (−1σ / avg / +1σ)" k="implied" {...{ sortKey, sortDir, sortBy }} align="center" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              const noImplied = !priced ? "Fetch prices →" : r.band.lower <= 0 ? "σ alta · editá low" : "—";
              return (
                <tr key={r.ticker} style={{ background: idx % 2 === 0 ? "#fff" : "rgba(248,250,255,0.5)" }}>
                  {/* Company */}
                  <td style={td}>
                    <div style={{ fontWeight: 600, color: TEXT1 }}>{r.name}</div>
                    <div style={{ fontSize: 10, color: TEXT3, fontFamily: "JetBrains Mono, monospace" }}>{r.ticker.replace(/ EQUITY$/i, "")}</div>
                  </td>
                  {/* GICS */}
                  <td style={{ ...td, fontSize: 11, color: TEXT2, maxWidth: 150 }}>{r.gics ?? "—"}</td>
                  {/* Current */}
                  <td style={{ ...td, textAlign: "right", fontFamily: "JetBrains Mono, monospace", fontWeight: 600, color: r.currentPrice != null ? TEXT1 : TEXT3 }}>{fmtCLP(r.currentPrice)}</td>
                  {/* Where are we */}
                  <td style={{ ...td, minWidth: 200 }}>
                    {r.implied && r.signal && r.currentPrice != null ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1 }}><Gauge low={r.implied.low} mid={r.implied.mid} high={r.implied.high} current={r.currentPrice} signal={r.signal} /></div>
                        <SignalBadge signal={r.signal} />
                      </div>
                    ) : <span style={{ color: TEXT3, fontSize: 11 }}>{noImplied}</span>}
                  </td>
                  {/* Multiple band (editable) */}
                  <td style={td}>
                    <BandEdit band={r.band} vals={r.vals} editable={metric === "pe"} edited={r.edited}
                      onChange={(f, v) => setBandField(r, f, v)} onReset={() => resetBand(r)} />
                  </td>
                  {/* Earnings: Utilidad NI (P/E) — o EBITDA + Deuda Neta (EV/EBITDA) */}
                  {metric === "pe" ? (
                    <td style={{ ...td, textAlign: "right", fontFamily: "JetBrains Mono, monospace", color: r.netIncome != null ? TEXT1 : TEXT3 }}>
                      {fmtMM(r.netIncome)}
                      {r.niCurrency && <span style={ccyBadge(r.niCurrency)}>{r.niCurrency}</span>}
                    </td>
                  ) : (
                    <>
                      <td style={{ ...td, textAlign: "right", fontFamily: "JetBrains Mono, monospace", color: r.ebitda != null ? TEXT1 : TEXT3 }}>
                        {fmtMM(r.ebitda)}
                        {r.niCurrency && <span style={ccyBadge(r.niCurrency)}>{r.niCurrency}</span>}
                      </td>
                      <td style={{ ...td, textAlign: "right", fontFamily: "JetBrains Mono, monospace", color: r.netDebt != null ? (r.netDebt < 0 ? GREEN : TEXT1) : TEXT3 }}>
                        {fmtBn(r.netDebt)}
                        {r.netDebt != null && r.netDebt < 0 && <span style={{ marginLeft: 4, fontSize: 9, color: GREEN }}>caja</span>}
                      </td>
                    </>
                  )}
                  {/* Acciones (+ EPS solo en P/E) */}
                  <td style={{ ...td, textAlign: "right", fontFamily: "JetBrains Mono, monospace" }}>
                    <div style={{ color: r.shares != null ? TEXT1 : TEXT3 }}>{fmtSh(r.shares)}</div>
                    {metric === "pe" && r.eps != null && <div style={{ fontSize: 10, color: TEXT3 }}>EPS {fmtCLP(r.eps)}</div>}
                  </td>
                  {/* Implied */}
                  <td style={{ ...td, textAlign: "center", fontFamily: "JetBrains Mono, monospace" }}>
                    {r.implied ? (
                      <span style={{ color: TEXT1 }}>{fmtCLP(r.implied.low)} <span style={{ color: TEXT3 }}>/</span> <strong>{fmtCLP(r.implied.mid)}</strong> <span style={{ color: TEXT3 }}>/</span> {fmtCLP(r.implied.high)}</span>
                    ) : <span style={{ color: TEXT3 }}>{noImplied}</span>}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={metric === "pe" ? 8 : 9} style={{ textAlign: "center", padding: 32, color: TEXT3, fontSize: 13 }}>
                No hay empresas con historia de {metricLabel} suficiente{gicsFilter !== "all" ? " en esta industria" : ""}.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Legend ────────────────────────────────────────────────────────── */}
      <div style={{ marginTop: 10, fontSize: 11, color: TEXT2, lineHeight: 1.6 }}>
        <div><strong>{rows.length} empresas.</strong> <strong>avg</strong> = promedio histórico del múltiplo forward (10A); la <strong>banda</strong> es avg ±1σ; <strong>n</strong> = nº de observaciones mensuales. Podés <strong>editar</strong> los múltiplos (low/avg/high con cualquier número) y el implícito se recalcula.</div>
        <div><strong>Monedas:</strong> los múltiplos no tienen moneda (son ratios). El NET_INCOME / EBITDA del consenso vienen en la moneda de reporte de la empresa; las que reportan en <span style={{ color: "#B45309", fontWeight: 700 }}>USD</span> se detectan y convierten a CLP con USDCLP (badge <span style={{ color: "#B45309", fontWeight: 700 }}>USD</span>). El precio está en CLP.</div>
        {metric === "ev" && <div><strong>EV/EBITDA:</strong> Equity = EV − Deuda Neta (<code>ss_universe.net_debt</code>, CLP; negativo = caja neta). Se ignoran minoritarios/asociadas. Precio implícito = Equity / acciones.</div>}
        <div><strong>Señal:</strong> <span style={{ color: GREY, fontWeight: 700 }}>gris = dentro de la banda</span> · <span style={{ color: GREEN, fontWeight: 700 }}>verde = bajo la banda (barata)</span> · <span style={{ color: RED, fontWeight: 700 }}>rojo = sobre la banda (cara)</span>.</div>
      </div>
    </div>
  );
}

// ── Style helpers ────────────────────────────────────────────────────────────────
const td: React.CSSProperties = { padding: "8px 12px", borderBottom: `1px solid ${BORDER}`, verticalAlign: "middle" };
const retryBtn: React.CSSProperties = { marginTop: 10, padding: "6px 16px", borderRadius: 6, background: "rgba(43,92,224,0.08)", border: "1px solid rgba(43,92,224,0.20)", color: BLUE, cursor: "pointer", fontSize: 13 };
const ccyBadge = (ccy: "CLP" | "USD"): React.CSSProperties => ({ marginLeft: 4, fontSize: 9, fontWeight: 700, color: ccy === "USD" ? "#B45309" : TEXT3, background: ccy === "USD" ? "rgba(180,83,9,0.12)" : "rgba(100,116,139,0.10)", borderRadius: 4, padding: "1px 4px" });

function Th({ label, k, sortKey, sortDir, sortBy, align }: {
  label: string; k: SortKey; sortKey: SortKey; sortDir: "asc" | "desc"; sortBy: (k: SortKey) => void; align: "left" | "right" | "center";
}) {
  const active = sortKey === k;
  return (
    <th onClick={() => sortBy(k)} style={{ padding: "8px 12px", textAlign: align, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", color: active ? BLUE : TEXT2, textTransform: "uppercase", whiteSpace: "nowrap", borderBottom: `1px solid ${BORDER}`, cursor: "pointer", userSelect: "none" }}>
      {label} <span style={{ fontSize: 9, opacity: active ? 1 : 0.35 }}>{active ? (sortDir === "asc" ? "▲" : "▼") : "↕"}</span>
    </th>
  );
}
