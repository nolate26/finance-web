"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";
import type { NavPayload } from "@/app/api/quant/nav/route";
import type { SignalsPayload, HoldingRow, MoveRow } from "@/app/api/quant/signals/route";
import type { TickerHistoryPayload } from "@/app/api/quant/ticker-history/route";

// ── Theme tokens ──────────────────────────────────────────────────────────────
const CARD     = "#FFFFFF";
const BORDER   = "rgba(15,23,42,0.08)";
const TEXT1    = "#0F172A";
const TEXT2    = "#64748B";
const GREEN    = "#059669";
const RED      = "#DC2626";
const BLUE     = "#2563EB";
const AMBER    = "#D97706";

const cardStyle: React.CSSProperties = {
  background: CARD,
  border: `1px solid ${BORDER}`,
  borderRadius: 12,
  boxShadow: "0 1px 4px rgba(15,23,42,0.06)",
};

// ── Formatters ────────────────────────────────────────────────────────────────
function fmtRet(v: number | null, decimals = 1): string {
  if (v == null) return "—";
  return (v >= 0 ? "+" : "") + v.toFixed(decimals) + "%";
}
function retColor(v: number | null): string {
  if (v == null) return TEXT2;
  return v > 0.05 ? GREEN : v < -0.05 ? RED : TEXT2;
}
function fmtPx(v: number | null): string {
  if (v == null) return "—";
  return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}
function fmtDateShort(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`;
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({
  label, value, valueColor, sub,
}: { label: string; value: string; valueColor?: string; sub?: string }) {
  return (
    <div style={{ ...cardStyle, padding: "14px 18px", display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.10em", color: TEXT2, textTransform: "uppercase" }}>
        {label}
      </span>
      <span style={{ fontSize: 22, fontWeight: 800, fontFamily: "JetBrains Mono, monospace", color: valueColor ?? TEXT1, letterSpacing: "-0.02em" }}>
        {value}
      </span>
      {sub && <span style={{ fontSize: 10, color: TEXT2 }}>{sub}</span>}
    </div>
  );
}

// ── Chart Tooltip ─────────────────────────────────────────────────────────────
function NavTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 14px", boxShadow: "0 4px 16px rgba(15,23,42,0.12)" }}>
      <p style={{ color: TEXT2, fontSize: 11, marginBottom: 6, fontFamily: "JetBrains Mono, monospace" }}>{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color, fontSize: 12, fontFamily: "JetBrains Mono, monospace", marginBottom: 2 }}>
          {p.name}: {p.value?.toFixed(1)}
        </p>
      ))}
    </div>
  );
}

// ── Ticker Modal ──────────────────────────────────────────────────────────────
function TickerModal({ ticker, onClose }: { ticker: string; onClose: () => void }) {
  const [data, setData] = useState<TickerHistoryPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/quant/ticker-history?ticker=${encodeURIComponent(ticker)}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [ticker]);

  // Close on ESC
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onClose}
    >
      <div
        style={{ ...cardStyle, padding: 24, width: 640, maxHeight: "80vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: TEXT1, fontFamily: "JetBrains Mono, monospace", margin: 0 }}>
              {ticker}
            </h2>
            <p style={{ fontSize: 11, color: TEXT2, margin: "2px 0 0" }}>
              Signal price history
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ background: "transparent", border: "none", color: TEXT2, fontSize: 18, cursor: "pointer", lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        {loading && (
          <div style={{ display: "flex", justifyContent: "center", padding: 32 }}>
            <div style={{ width: 24, height: 24, borderRadius: "50%", border: `2px solid rgba(59,130,246,0.2)`, borderTopColor: BLUE, animation: "spin 0.8s linear infinite" }} />
          </div>
        )}

        {data && !loading && (
          <>
            {/* Mini chart */}
            <div style={{ height: 160, marginBottom: 16 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.history} margin={{ top: 4, right: 4, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.06)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: TEXT2, fontSize: 9 }}
                    tickFormatter={fmtDateShort}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fill: TEXT2, fontSize: 9 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => v.toFixed(0)}
                    width={48}
                  />
                  <Tooltip content={<NavTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="pxSignal"
                    name="px_signal"
                    stroke={BLUE}
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* History table */}
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#F1F5F9" }}>
                  {["Date", "Side", "Rank", "px_signal"].map((h) => (
                    <th key={h} style={{ padding: "6px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: TEXT2, letterSpacing: "0.08em", textTransform: "uppercase" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...data.history].reverse().map((row, i) => (
                  <tr key={row.date} style={{ background: i % 2 === 0 ? "transparent" : "rgba(15,23,42,0.025)" }}>
                    <td style={{ padding: "6px 10px", fontSize: 11, color: TEXT2, fontFamily: "JetBrains Mono, monospace" }}>{row.date}</td>
                    <td style={{ padding: "6px 10px", fontSize: 11, fontWeight: 700, color: row.side === "LONG" ? GREEN : RED }}>{row.side}</td>
                    <td style={{ padding: "6px 10px", fontSize: 11, color: TEXT2 }}>{row.rank ?? "—"}</td>
                    <td style={{ padding: "6px 10px", fontSize: 11, color: TEXT1, fontFamily: "JetBrains Mono, monospace" }}>{fmtPx(row.pxSignal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}

// ── Section Label ─────────────────────────────────────────────────────────────
function SLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.10em", color: TEXT2, textTransform: "uppercase", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ display: "inline-block", width: 3, height: 12, borderRadius: 2, background: BLUE }} />
      {children}
    </div>
  );
}

// ── Momentum Dashboard ────────────────────────────────────────────────────────
function MomentumDashboard() {
  const [navData, setNavData]       = useState<NavPayload | null>(null);
  const [signals, setSignals]       = useState<SignalsPayload | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [modalTicker, setModalTicker] = useState<string | null>(null);
  const [navLoading, setNavLoading] = useState(true);
  const [sigsLoading, setSigsLoading] = useState(false);
  const [navError, setNavError]     = useState<string | null>(null);

  // Fetch NAV series on mount
  useEffect(() => {
    setNavLoading(true);
    fetch("/api/quant/nav")
      .then((r) => r.json())
      .then((d: NavPayload) => {
        setNavData(d);
        if (d.signalDates.length > 0) {
          const latest = d.signalDates[d.signalDates.length - 1];
          setSelectedDate(latest);
        }
      })
      .catch((e) => setNavError(String(e)))
      .finally(() => setNavLoading(false));
  }, []);

  // Fetch signals whenever selectedDate changes
  const fetchSignals = useCallback((date: string) => {
    if (!date) return;
    setSigsLoading(true);
    fetch(`/api/quant/signals?date=${date}`)
      .then((r) => r.json())
      .then((d: SignalsPayload) => setSignals(d))
      .finally(() => setSigsLoading(false));
  }, []);

  useEffect(() => {
    if (selectedDate) fetchSignals(selectedDate);
  }, [selectedDate, fetchSignals]);

  // ── Derived KPIs ────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    if (!navData || !selectedDate || !signals) return null;

    const dateIdx = navData.signalDates.indexOf(selectedDate);
    if (dateIdx < 0) return null;

    const current = navData.navSeries[dateIdx];
    if (!current) return null;

    const cumReturn  = current.portfolio - 100;
    const mxlaCum    = current.mxla != null ? current.mxla - 100 : null;
    const alpha      = mxlaCum != null ? cumReturn - mxlaCum : null;

    // YTD: last nav point before Jan 1 of selected year
    const year = selectedDate.slice(0, 4);
    let ytdStartNAV = 100;
    for (let i = dateIdx - 1; i >= 0; i--) {
      if (navData.signalDates[i] < `${year}-01-01`) {
        ytdStartNAV = navData.navSeries[i].portfolio;
        break;
      }
    }
    const ytdReturn = (current.portfolio / ytdStartNAV - 1) * 100;

    // Weekly return from weeklyPeriods
    const weekPeriod = navData.weeklyPeriods.find((p) => p.date === selectedDate);
    const weeklyReturn = weekPeriod?.portfolioReturn ?? null;

    // Turnover
    const prevSize = signals.prevTickers.length;
    const turnover = prevSize > 0
      ? Math.round((signals.moves.length / prevSize) * 1000) / 10
      : null;

    return { cumReturn, ytdReturn, weeklyReturn, alpha, turnover };
  }, [navData, selectedDate, signals]);

  // History table (last 5 periods up to and including selectedDate)
  const historyRows = useMemo(() => {
    if (!navData || !selectedDate) return [];
    const dateIdx = navData.signalDates.indexOf(selectedDate);
    if (dateIdx < 0) return [];
    // weeklyPeriods[j].date = signalDates[j]  (keyed by T0, the signal formation date)
    // The entry at dateIdx is the period STARTING on selectedDate; the last entry
    // (the open period) has portfolioReturn = null and shows "—" naturally.
    const endJ   = dateIdx;
    const startJ = Math.max(0, endJ - 4);
    return navData.weeklyPeriods
      .slice(startJ, endJ + 1)
      .reverse()
      .map((p) => ({ ...p }));
  }, [navData, selectedDate]);

  // Chart data: thin down to ~80 points for performance
  const chartData = useMemo(() => {
    if (!navData) return [];
    const series = navData.navSeries;
    if (series.length <= 80) return series.map((p) => ({ ...p, date: fmtDateShort(p.date) }));
    const step = Math.ceil(series.length / 80);
    return series
      .filter((_, i) => i % step === 0 || i === series.length - 1)
      .map((p) => ({ ...p, date: fmtDateShort(p.date) }));
  }, [navData]);

  // ── Loading / Error states ────────────────────────────────────────────────
  if (navLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", border: `2px solid rgba(59,130,246,0.2)`, borderTopColor: BLUE, animation: "spin 0.8s linear infinite" }} />
          <span style={{ fontSize: 12, color: TEXT2, fontFamily: "JetBrains Mono, monospace" }}>Loading signal data...</span>
        </div>
      </div>
    );
  }

  if (navError) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400 }}>
        <p style={{ color: RED, fontSize: 13 }}>{navError}</p>
      </div>
    );
  }

  if (!navData || navData.signalDates.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400 }}>
        <p style={{ color: TEXT2, fontSize: 13 }}>No signal data available.</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* ── Top bar: title + date picker ────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: TEXT1, letterSpacing: "-0.02em", margin: 0, fontFamily: "JetBrains Mono, monospace" }}>
            Momentum Americas L/S
          </h2>
          <p style={{ fontSize: 11, color: TEXT2, marginTop: 3 }}>
            Weekly equal-weight long/short · Americas universe
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: TEXT2, fontFamily: "JetBrains Mono, monospace" }}>Signal date</span>
          <select
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            style={{
              background: CARD, border: `1px solid ${BORDER}`,
              borderRadius: 8, padding: "6px 10px",
              color: TEXT1, fontSize: 12, fontFamily: "JetBrains Mono, monospace",
              cursor: "pointer", outline: "none",
            }}
          >
            {[...navData.signalDates].reverse().map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── KPI cards ────────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
        <KpiCard
          label="Cumulative Return"
          value={kpis ? fmtRet(kpis.cumReturn) : "—"}
          valueColor={kpis ? retColor(kpis.cumReturn) : TEXT2}
          sub="Since inception"
        />
        <KpiCard
          label="YTD Return"
          value={kpis ? fmtRet(kpis.ytdReturn) : "—"}
          valueColor={kpis ? retColor(kpis.ytdReturn) : TEXT2}
          sub={selectedDate.slice(0, 4)}
        />
        <KpiCard
          label="Weekly Return"
          value={kpis?.weeklyReturn != null ? fmtRet(kpis.weeklyReturn) : "Open"}
          valueColor={kpis?.weeklyReturn != null ? retColor(kpis.weeklyReturn) : AMBER}
          sub={kpis?.weeklyReturn != null ? "Last closed period" : "Period in progress"}
        />
        <KpiCard
          label="Alpha vs MXLA"
          value={kpis?.alpha != null ? fmtRet(kpis.alpha) : "—"}
          valueColor={kpis?.alpha != null ? retColor(kpis.alpha) : TEXT2}
          sub="Cumulative"
        />
        <KpiCard
          label="Longs / Shorts"
          value={signals ? `${signals.nLongs} / ${signals.nShorts}` : "—"}
          valueColor={TEXT1}
          sub="Active positions"
        />
        <KpiCard
          label="Turnover"
          value={kpis?.turnover != null ? `${kpis.turnover.toFixed(0)}%` : "—"}
          valueColor={TEXT1}
          sub="vs prior week"
        />
      </div>

      {/* ── NAV Chart ────────────────────────────────────────────────────── */}
      <div style={{ ...cardStyle, padding: "18px 20px" }}>
        <SLabel>Portfolio NAV vs MXLA (Base 100)</SLabel>
        <div style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,23,42,0.06)" />
              <XAxis
                dataKey="date"
                tick={{ fill: TEXT2, fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: TEXT2, fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => v.toFixed(0)}
                width={48}
              />
              <ReferenceLine y={100} stroke="rgba(15,23,42,0.15)" strokeDasharray="4 4" />
              <Tooltip content={<NavTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: 11, color: TEXT2 }}
                formatter={(value) => <span style={{ color: TEXT2 }}>{value}</span>}
              />
              <Line
                type="monotone"
                dataKey="portfolio"
                name="Portfolio"
                stroke={BLUE}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: BLUE }}
              />
              <Line
                type="monotone"
                dataKey="mxla"
                name="MXLA"
                stroke={AMBER}
                strokeWidth={1.5}
                dot={false}
                strokeDasharray="4 4"
                activeDot={{ r: 3, fill: AMBER }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Holdings + Moves ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Current Holdings */}
        <div style={{ ...cardStyle, padding: "18px 20px", height: 1000, display: "flex", flexDirection: "column" }}>
          <SLabel>
            Current Holdings
            {selectedDate && <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}> — {fmtDate(selectedDate)}</span>}
          </SLabel>

          {sigsLoading ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid rgba(59,130,246,0.2)`, borderTopColor: BLUE, animation: "spin 0.8s linear infinite" }} />
            </div>
          ) : (
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead style={{ position: "sticky", top: 0, zIndex: 1, background: "#F1F5F9" }}>
                  <tr>
                    {["Ticker", "Side", "Rank", "Px Signal", "Weight", "Ret. Entry"].map((h) => (
                      <th key={h} style={{ padding: "6px 8px", textAlign: "left", fontSize: 9, fontWeight: 700, color: TEXT2, letterSpacing: "0.08em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(signals?.holdings ?? []).map((h: HoldingRow, i: number) => {
                    const isNeutral = h.side !== "LONG" && h.side !== "SHORT";
                    const sideColor = h.side === "LONG" ? GREEN : h.side === "SHORT" ? RED : TEXT2;
                    const retColor = h.entryReturn == null || isNeutral ? TEXT2
                      : h.side === "LONG"
                        ? (h.entryReturn >= 0 ? GREEN : RED)
                        : (h.entryReturn <= 0 ? GREEN : RED);
                    return (
                      <tr
                        key={h.ticker}
                        style={{ background: i % 2 === 0 ? "transparent" : "rgba(15,23,42,0.025)", cursor: "pointer" }}
                        onClick={() => setModalTicker(h.ticker)}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(59,130,246,0.08)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = i % 2 === 0 ? "transparent" : "rgba(15,23,42,0.025)")}
                      >
                        <td style={{ padding: "5px 8px", color: BLUE, fontFamily: "JetBrains Mono, monospace", fontWeight: 600 }}>{h.ticker}</td>
                        <td style={{ padding: "5px 8px", fontWeight: 700, color: sideColor }}>{h.side}</td>
                        <td style={{ padding: "5px 8px", color: TEXT2 }}>{h.rank ?? "—"}</td>
                        <td style={{ padding: "5px 8px", color: TEXT1, fontFamily: "JetBrains Mono, monospace" }}>{fmtPx(h.pxSignal)}</td>
                        <td style={{ padding: "5px 8px", color: TEXT2, fontFamily: "JetBrains Mono, monospace" }}>
                          {h.weight != null ? h.weight.toFixed(1) + "%" : "—"}
                        </td>
                        <td style={{ padding: "5px 8px", fontFamily: "JetBrains Mono, monospace", fontWeight: 700 }}>
                          {h.entryReturn != null ? (
                            <span style={{ color: retColor }}>
                              {h.entryReturn >= 0 ? "+" : ""}{h.entryReturn.toFixed(1)}%
                            </span>
                          ) : (
                            <span style={{ color: TEXT2 }}>—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {!sigsLoading && (signals?.holdings ?? []).length === 0 && (
                    <tr><td colSpan={6} style={{ padding: "16px 8px", color: TEXT2, textAlign: "center" }}>No holdings</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Last Rebalance Moves */}
        <div style={{ ...cardStyle, padding: "18px 20px", height: 1000, display: "flex", flexDirection: "column" }}>
          <SLabel>Last Rebalance Moves</SLabel>

          {sigsLoading ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid rgba(59,130,246,0.2)`, borderTopColor: BLUE, animation: "spin 0.8s linear infinite" }} />
            </div>
          ) : (
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead style={{ position: "sticky", top: 0, zIndex: 1, background: "#F1F5F9" }}>
                  <tr>
                    {["Ticker", "Action", "Px Signal"].map((h) => (
                      <th key={h} style={{ padding: "6px 8px", textAlign: "left", fontSize: 9, fontWeight: 700, color: TEXT2, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(signals?.moves ?? []).map((m: MoveRow, i: number) => {
                    const isNeutralAction = m.action.includes("NEUTRAL");
                    const isBuy = !isNeutralAction && (m.action.includes("BUY") || m.action.includes("LONG"));
                    const isSell = !isNeutralAction && (m.action.includes("SELL") || m.action.includes("SHORT") || m.action.includes("CLOSE") || m.action.includes("COVER"));
                    const actionColor = isNeutralAction ? TEXT2 : isBuy && !isSell ? GREEN : isSell && !isBuy ? RED : AMBER;
                    return (
                      <tr
                        key={`${m.ticker}-${i}`}
                        style={{ background: i % 2 === 0 ? "transparent" : "rgba(15,23,42,0.025)" }}
                      >
                        <td style={{ padding: "5px 8px", color: BLUE, fontFamily: "JetBrains Mono, monospace", fontWeight: 600 }}>{m.ticker}</td>
                        <td style={{ padding: "5px 8px" }}>
                          <span style={{
                            fontSize: 10, fontWeight: 700, color: actionColor,
                            background: `${actionColor}18`, border: `1px solid ${actionColor}33`,
                            borderRadius: 4, padding: "2px 6px",
                          }}>
                            {m.action}
                          </span>
                        </td>
                        <td style={{ padding: "5px 8px", color: TEXT1, fontFamily: "JetBrains Mono, monospace" }}>{fmtPx(m.pxSignal)}</td>
                      </tr>
                    );
                  })}
                  {!sigsLoading && (signals?.moves ?? []).length === 0 && (
                    <tr><td colSpan={3} style={{ padding: "16px 8px", color: TEXT2, textAlign: "center" }}>No changes vs prior week</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Holdings History ─────────────────────────────────────────────── */}
      <div style={{ ...cardStyle, padding: "18px 20px" }}>
        <SLabel>Holdings History — Last 5 Periods</SLabel>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr style={{ background: "#F1F5F9" }}>
              {["Signal Date", "Longs", "Shorts", "Weekly Return", "MXLA Return", "Alpha"].map((h) => (
                <th key={h} style={{ padding: "6px 10px", textAlign: "left", fontSize: 9, fontWeight: 700, color: TEXT2, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {historyRows.map((row, i) => (
              <tr key={row.date} style={{ background: i % 2 === 0 ? "transparent" : "rgba(15,23,42,0.025)" }}>
                <td style={{ padding: "6px 10px", color: TEXT2, fontFamily: "JetBrains Mono, monospace" }}>{row.date}</td>
                <td style={{ padding: "6px 10px", color: GREEN }}>{row.nLongs}</td>
                <td style={{ padding: "6px 10px", color: RED }}>{row.nShorts}</td>
                <td style={{ padding: "6px 10px", color: retColor(row.portfolioReturn), fontFamily: "JetBrains Mono, monospace", fontWeight: 600 }}>
                  {fmtRet(row.portfolioReturn)}
                </td>
                <td style={{ padding: "6px 10px", color: retColor(row.mxlaReturn), fontFamily: "JetBrains Mono, monospace" }}>
                  {row.mxlaReturn != null ? fmtRet(row.mxlaReturn) : "—"}
                </td>
                <td style={{ padding: "6px 10px", fontFamily: "JetBrains Mono, monospace", fontWeight: 700 }}>
                  {(() => {
                    const a = row.portfolioReturn != null && row.mxlaReturn != null
                      ? row.portfolioReturn - row.mxlaReturn
                      : null;
                    return <span style={{ color: retColor(a) }}>{a != null ? fmtRet(a) : "—"}</span>;
                  })()}
                </td>
              </tr>
            ))}
            {historyRows.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: "16px 10px", color: TEXT2, textAlign: "center" }}>
                  No historical data
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Ticker modal */}
      {modalTicker && <TickerModal ticker={modalTicker} onClose={() => setModalTicker(null)} />}
    </div>
  );
}

// ── Tab nav ───────────────────────────────────────────────────────────────────
type QuantTab = "momentum" | "kpi" | "resources";

const TABS: { key: QuantTab; label: string }[] = [
  { key: "momentum",  label: "Momentum Model" },
  { key: "kpi",       label: "KPI Matrix"      },
  { key: "resources", label: "Resources"       },
];

// ── Page ──────────────────────────────────────────────────────────────────────
export default function QuantPage() {
  const [activeTab, setActiveTab] = useState<QuantTab>("momentum");

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div className="max-w-[1600px] mx-auto px-6 py-6">
        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#0F172A", letterSpacing: "-0.02em" }}>
            Quant &amp; Signals
          </h1>
          <p style={{ fontSize: 12, marginTop: 4, color: "#64748B" }}>
            Quantitative models, factor signals, and systematic research tools
          </p>
        </div>

        {/* Tab nav */}
        <div
          className="flex items-center gap-1 mb-6 p-1 rounded-lg"
          style={{ background: "rgba(15,23,42,0.04)", border: "1px solid rgba(15,23,42,0.08)", width: "fit-content" }}
        >
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className="px-5 py-1.5 rounded-md text-sm font-semibold transition-all"
              style={{
                background: activeTab === key ? "rgba(43,92,224,0.10)" : "transparent",
                color:      activeTab === key ? "#1E3A8A" : "#64748B",
                border:     activeTab === key ? "1px solid rgba(43,92,224,0.25)" : "1px solid transparent",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        {activeTab === "momentum" && <MomentumDashboard />}

        {activeTab === "kpi" && (
          <div className="card flex flex-col items-center justify-center gap-3" style={{ minHeight: 320 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: "rgba(43,92,224,0.08)", border: "1px solid rgba(43,92,224,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>
              🧮
            </div>
            <p style={{ fontSize: 14, fontWeight: 600, color: "#0F172A" }}>KPI Matrix</p>
            <p style={{ fontSize: 12, color: "#94A3B8", textAlign: "center", maxWidth: 360 }}>
              Aggregated financial KPIs across sectors — revenue growth, margin trends, and consensus estimate revisions. Data pipeline coming soon.
            </p>
          </div>
        )}

        {activeTab === "resources" && (
          <div className="card flex flex-col items-center justify-center gap-3" style={{ minHeight: 320 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: "rgba(43,92,224,0.08)", border: "1px solid rgba(43,92,224,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>
              📚
            </div>
            <p style={{ fontSize: 14, fontWeight: 600, color: "#0F172A" }}>Resources</p>
            <p style={{ fontSize: 12, color: "#94A3B8", textAlign: "center", maxWidth: 360 }}>
              Research papers, methodology documentation, and model calibration notes. Coming soon.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
