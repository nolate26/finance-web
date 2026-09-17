"use client";

import { useMemo, useState } from "react";
import { Play, Loader2, CalendarDays } from "lucide-react";
import type { ExtractCompany } from "@/app/api/extract/universe/route";
import type { ExtractConsensusPayload } from "@/app/api/extract/consensus/route";
import { CONSENSUS_METRICS, type ModelKind } from "@/lib/extractMetrics";
import type { SheetDef } from "@/lib/exportExcel";
import ExportButtons from "@/components/ExportButtons";
import { countryName } from "@/lib/countryNames";
import { FONT_SECONDARY, PATRIA, TEXT, sentimentColor } from "@/lib/patriaTheme";
import {
  useExtractUniverse, FilterCard, ChipGroup, TickerPicker, ResultTable, PRIMARY_BTN, GHOST_BTN,
  fmtAbs, fmtPct, fmtMult, type ResultColumn,
} from "./ui";

// Consensus View — consenso Bloomberg vs modelo Moneda, por compañía y año objetivo.
//  · Compare: última foto del consenso vs modelo, desviación % y múltiplos del modelo.
//  · History: todas las fotos mensuales del consenso (formato largo) para ver la deriva.

type Mode = "compare" | "history";
const KINDS: ModelKind[] = ["company", "bank"];

const varRender = (v: unknown) => {
  const n = typeof v === "number" ? v : null;
  return { text: fmtPct(n, true), color: n == null ? TEXT.muted : sentimentColor(n), weight: n == null ? 400 : 700 };
};
const absRender  = (v: unknown) => ({ text: fmtAbs(typeof v === "number" ? v : null) });
const multRender = (v: unknown) => ({ text: fmtMult(typeof v === "number" ? v : null) });

export default function ConsensusExtractor() {
  const { universe, loading: uLoading, error: uError } = useExtractUniverse();

  const [kinds,     setKinds]     = useState<Set<ModelKind>>(new Set(KINDS));
  const [countries, setCountries] = useState<Set<string>>(new Set());
  const [tickers,   setTickers]   = useState<Set<string>>(new Set());
  const [years,     setYears]     = useState<Set<number> | null>(null);   // null = todos los disponibles
  const [mode,      setMode]      = useState<Mode>("compare");

  const [result,  setResult]  = useState<ExtractConsensusPayload | null>(null);
  const [running, setRunning] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const availableYears = universe?.consensusYears ?? [];
  const yearsSel = years ?? new Set(availableYears);

  const candidates: ExtractCompany[] = useMemo(() => {
    if (!universe) return [];
    return universe.companies.filter((c) =>
      kinds.has(c.kind) && (countries.size === 0 || (c.country != null && countries.has(c.country))),
    );
  }, [universe, kinds, countries]);

  const toggleIn = <T,>(set: Set<T>, v: T): Set<T> => { const n = new Set(set); if (n.has(v)) n.delete(v); else n.add(v); return n; };

  async function run() {
    if (tickers.size === 0 || yearsSel.size === 0) return;
    setRunning(true); setError(null);
    try {
      const res = await fetch("/api/extract/consensus", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers: [...tickers], years: [...yearsSel], mode }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      setResult(d as ExtractConsensusPayload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Query failed");
    } finally {
      setRunning(false);
    }
  }

  // ── Tabla ──────────────────────────────────────────────────────────────────
  const table = useMemo(() => {
    if (!result) return null;
    if (result.mode === "compare") {
      const columns: ResultColumn[] = [
        { key: "name",          label: "Company",  align: "left", sticky: true },
        { key: "ticker",        label: "Ticker",   align: "left" },
        { key: "country",       label: "Country",  align: "left", render: (v) => ({ text: v ? countryName(String(v)) : "—" }) },
        { key: "year",          label: "Year",     align: "center" },
        { key: "ccy",           label: "CCY",      align: "left" },
        { key: "consensusDate", label: "Cons. as of", align: "left" },
        { key: "updateDate",    label: "Model as of", align: "left" },
        ...CONSENSUS_METRICS.flatMap((m) => [
          { key: `c_${m.key}`, label: "Consensus", group: m.label, render: absRender } as ResultColumn,
          { key: `m_${m.key}`, label: "Moneda",    group: m.label, render: absRender } as ResultColumn,
          { key: `v_${m.key}`, label: "Var %",     group: m.label, render: varRender } as ResultColumn,
        ]),
        { key: "pe",       label: "P/E",       group: "Moneda multiples", render: multRender },
        { key: "evEbitda", label: "EV/EBITDA", group: "Moneda multiples", render: multRender },
      ];
      const rows = result.compare.map((r) => {
        const row: Record<string, unknown> = {
          name: r.name, ticker: r.ticker, country: r.country, year: r.year, ccy: r.currency,
          consensusDate: r.consensusDate, updateDate: r.updateDate, pe: r.multiples.pe, evEbitda: r.multiples.evEbitda,
        };
        for (const m of CONSENSUS_METRICS) {
          row[`c_${m.key}`] = r.consensus[m.key];
          row[`m_${m.key}`] = r.model[m.key];
          row[`v_${m.key}`] = r.varPct[m.key];
        }
        return row;
      });
      return { columns, rows };
    }
    const columns: ResultColumn[] = [
      { key: "name",      label: "Company",   align: "left", sticky: true },
      { key: "ticker",    label: "Ticker",    align: "left" },
      { key: "year",      label: "Year",      align: "center" },
      { key: "metric",    label: "Metric",    align: "left" },
      { key: "date",      label: "Cons. date", align: "left" },
      { key: "consensus", label: "Consensus", render: absRender },
      { key: "model",     label: "Moneda",    render: absRender },
      { key: "varPct",    label: "Var %",     render: varRender },
    ];
    const rows: Record<string, unknown>[] = result.history.map((r) => ({
      name: r.name, ticker: r.ticker, year: r.year, metric: r.metric, date: r.date,
      consensus: r.consensus, model: r.model,
      varPct: r.model != null && r.consensus != null && r.consensus !== 0 ? ((r.model - r.consensus) / Math.abs(r.consensus)) * 100 : null,
    }));
    return { columns, rows };
  }, [result]);

  function buildSheets(): SheetDef[] {
    if (!table || !result) return [];
    const headers = table.columns.map((c) => (c.group ? `${c.group} ${c.label}` : c.label));
    const rows = table.rows.map((r) => table.columns.map((c) => {
      const v = r[c.key];
      if (c.key === "country" && typeof v === "string") return countryName(v);
      if (typeof v === "number" && (c.key.startsWith("v_") || c.key === "varPct")) return +v.toFixed(2);
      return v == null ? null : (typeof v === "number" ? v : String(v));
    }));
    return [{ name: result.mode === "compare" ? "Consensus vs Moneda" : "Consensus history", headers, rows }];
  }

  const canRun = tickers.size > 0 && yearsSel.size > 0 && !running;

  if (uLoading) return <div style={{ padding: "60px 0", textAlign: "center", color: TEXT.label, fontSize: 12 }}>Loading model universe…</div>;
  if (uError || !universe) return <div style={{ padding: 40, textAlign: "center", color: PATRIA.pink, fontSize: 13 }}>Failed to load universe{uError ? `: ${uError}` : ""}.</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      <div className="g-stack-md" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.2fr)", gap: 14, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          <FilterCard title="Target years" hint="consensus_estimates">
            <ChipGroup
              options={availableYears}
              selected={yearsSel}
              onToggle={(y) => setYears(toggleIn(yearsSel, y))}
              onAll={() => setYears(null)}
              labelOf={(y) => `${y}E`}
            />
          </FilterCard>
          <FilterCard title="Model type">
            <ChipGroup options={KINDS} selected={kinds} onToggle={(k) => setKinds(toggleIn(kinds, k))} labelOf={(k) => (k === "bank" ? "Banks" : "Companies")} />
          </FilterCard>
          <FilterCard title="Country" hint={countries.size ? `${countries.size} selected` : "all"}>
            <ChipGroup options={universe.countries} selected={countries} onToggle={(c) => setCountries(toggleIn(countries, c))} onNone={() => setCountries(new Set())} labelOf={countryName} />
          </FilterCard>
          <FilterCard title="View">
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {([["compare", "Latest vs Moneda"], ["history", "Consensus history"]] as const).map(([m, label]) => (
                <button key={m} type="button" onClick={() => setMode(m)}
                  style={{ ...GHOST_BTN, ...(mode === m ? { borderColor: PATRIA.kingBlue, color: PATRIA.blue, background: "rgba(32,68,220,0.08)" } : {}) }}>
                  {label}
                </button>
              ))}
            </div>
            <span style={{ fontSize: 11, color: TEXT.muted }}>
              {mode === "compare"
                ? "One row per company × year: latest Bloomberg consensus, Moneda model, deviation, and model multiples at live price."
                : "One row per company × year × metric × consensus snapshot (monthly) — long format, ready to pivot in Excel."}
            </span>
          </FilterCard>
        </div>

        <FilterCard title="Companies" hint={`${candidates.length} match filters`}>
          <TickerPicker candidates={candidates} selected={tickers} onChange={setTickers} maxHeight={380} />
        </FilterCard>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, color: TEXT.muted }}>
          Consensus is rescaled to each model&rsquo;s scale and the model is converted with its FX → consensus factor, so both columns are directly comparable.
        </span>
        <button type="button" onClick={run} disabled={!canRun} style={{ ...PRIMARY_BTN, marginLeft: "auto", opacity: canRun ? 1 : 0.5, cursor: canRun ? "pointer" : "not-allowed" }}>
          {running ? <Loader2 size={14} style={{ animation: "spin 0.8s linear infinite" }} /> : <Play size={14} />}
          {running ? "Running…" : `Run query (${tickers.size} × ${yearsSel.size})`}
        </button>
      </div>

      {error && (
        <div style={{ padding: "9px 14px", borderRadius: 8, background: "rgba(248,72,94,0.06)", border: "1px solid rgba(248,72,94,0.22)", color: PATRIA.pink, fontSize: 12 }}>{error}</div>
      )}

      {result && table && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: TEXT.label, fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums" }}>
              {table.rows.length} rows · {result.years.map((y) => `${y}E`).join(", ")}
            </span>
            {result.pricesAsOf && result.mode === "compare" && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: PATRIA.kingBlue, fontWeight: 600 }}>
                <CalendarDays size={13} /> Multiples at prices as of {result.pricesAsOf}
              </span>
            )}
            <ExportButtons
              style={{ marginLeft: "auto" }}
              sheets={buildSheets}
              filename={`consensus_${result.mode}_${new Date().toISOString().slice(0, 10)}`}
              count={table.rows.length}
              pdf={{ title: result.mode === "compare" ? "Consensus vs Moneda" : "Consensus history", subtitle: `${result.compare.length || result.history.length} rows · ${result.years.map((y) => `${y}E`).join(", ")}` }}
            />
          </div>
          <ResultTable columns={table.columns} rows={table.rows} emptyText="No consensus for this selection." />
        </>
      )}
    </div>
  );
}
