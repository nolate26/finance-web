"use client";

import { useMemo, useState } from "react";
import { Play, Loader2, Rows3, Columns3 } from "lucide-react";
import type { ExtractCompany } from "@/app/api/extract/universe/route";
import type { ExtractModelsPayload, ExtractModelHeader } from "@/app/api/extract/models/route";
import { METRICS, METRIC_BY_ID, SECTIONS, DEFAULT_METRIC_IDS, metricAppliesTo, type ModelKind, type MetricDef } from "@/lib/extractMetrics";
import type { SheetDef } from "@/lib/exportExcel";
import ExportButtons from "@/components/ExportButtons";
import { countryName } from "@/lib/countryNames";
import { FONT_SECONDARY, PATRIA, TEXT, BORDER } from "@/lib/patriaTheme";
import {
  useExtractUniverse, FilterCard, ChipGroup, TickerPicker, ResultTable, CONTROL, PRIMARY_BTN, GHOST_BTN,
  fmtAbs, fmtSmall, fmtPct, type ResultColumn,
} from "./ui";

// Financial Models — exportador masivo. Flujo: filtros (país / sector / tipo) acotan el
// universo → se eligen tickers y métricas → "Run" pide /api/extract/models → la
// misma tabla se muestra en pantalla y se exporta a Excel / PDF.

type Layout = "metrics" | "years";   // métricas como filas (años en columnas) | años como filas

const KINDS: ModelKind[] = ["company", "bank"];
const KIND_LABEL: Record<ModelKind, string> = { company: "Companies", bank: "Banks" };

function fmtMetric(v: unknown, def: MetricDef | undefined): { text: string; color?: string } {
  const n = typeof v === "number" ? v : null;
  if (n == null) return { text: "—", color: TEXT.muted };
  switch (def?.format) {
    case "pct":   return { text: fmtPct(n * 100) };
    case "small": return { text: fmtSmall(n) };
    default:      return { text: fmtAbs(n) };
  }
}

export default function ModelsExtractor() {
  const { universe, loading: uLoading, error: uError } = useExtractUniverse();

  // Filtros del universo
  const [countries,  setCountries]  = useState<Set<string>>(new Set());
  const [industries, setIndustries] = useState<Set<string>>(new Set());
  const [kinds,      setKinds]      = useState<Set<ModelKind>>(new Set(KINDS));
  const [tickers,    setTickers]    = useState<Set<string>>(new Set());

  // Métricas y años
  const [metricIds, setMetricIds] = useState<Set<string>>(new Set(DEFAULT_METRIC_IDS));
  const [yearFrom,  setYearFrom]  = useState<string>("");
  const [yearTo,    setYearTo]    = useState<string>("");
  const [layout,    setLayout]    = useState<Layout>("metrics");
  const [withHeader, setWithHeader] = useState(false);

  // Resultado
  const [result,  setResult]  = useState<ExtractModelsPayload | null>(null);
  const [running, setRunning] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const candidates: ExtractCompany[] = useMemo(() => {
    if (!universe) return [];
    return universe.companies.filter((c) =>
      kinds.has(c.kind) &&
      (countries.size  === 0 || (c.country  != null && countries.has(c.country))) &&
      (industries.size === 0 || (c.industry != null && industries.has(c.industry))),
    );
  }, [universe, kinds, countries, industries]);

  // Métricas visibles: las que aplican a algún tipo de modelo presente en la selección.
  const selectedKinds = useMemo(() => {
    const ks = new Set<ModelKind>();
    for (const c of candidates) if (tickers.has(c.ticker)) ks.add(c.kind);
    return ks.size ? ks : kinds;
  }, [candidates, tickers, kinds]);
  const visibleMetrics = METRICS.filter((m) => [...selectedKinds].some((k) => metricAppliesTo(m, k)));

  const toggleIn = <T,>(set: Set<T>, v: T): Set<T> => { const n = new Set(set); if (n.has(v)) n.delete(v); else n.add(v); return n; };

  async function run() {
    if (tickers.size === 0 || metricIds.size === 0) return;
    setRunning(true); setError(null);
    try {
      const res = await fetch("/api/extract/models", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tickers: [...tickers],
          metrics: METRICS.filter((m) => metricIds.has(m.id)).map((m) => m.id),   // orden del catálogo
          yearFrom: yearFrom ? Number(yearFrom) : undefined,
          yearTo:   yearTo   ? Number(yearTo)   : undefined,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      setResult(d as ExtractModelsPayload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Query failed");
    } finally {
      setRunning(false);
    }
  }

  // ── Pivot a la vista elegida ───────────────────────────────────────────────
  const now = new Date().getFullYear();
  const yearLabel = (y: number) => (y >= now ? `${y}E` : String(y));

  const table = useMemo(() => {
    if (!result) return null;
    const hdrByTicker = new Map<string, ExtractModelHeader>(result.headers.map((h) => [h.ticker, h]));
    const rowsByTicker = new Map<string, Map<number, Record<string, number | null>>>();
    for (const r of result.rows) {
      if (!rowsByTicker.has(r.ticker)) rowsByTicker.set(r.ticker, new Map());
      rowsByTicker.get(r.ticker)!.set(r.year, r.values);
    }
    const headers = [...result.headers].sort((a, b) => a.name.localeCompare(b.name));

    const idCols: ResultColumn[] = [
      { key: "name",    label: "Company", align: "left", sticky: true },
      { key: "ticker",  label: "Ticker",  align: "left" },
      { key: "country", label: "Country", align: "left", render: (v) => ({ text: v ? countryName(String(v)) : "—" }) },
      { key: "kind",    label: "Type",    align: "left" },
      { key: "ccy",     label: "CCY",     align: "left" },
      { key: "unit",    label: "Unit",    align: "left" },
      ...(withHeader ? [
        { key: "updateDate", label: "Updated", align: "left" } as ResultColumn,
        { key: "analyst",    label: "Analyst", align: "left" } as ResultColumn,
        { key: "recc",       label: "Rec",     align: "center" } as ResultColumn,
        { key: "tp",         label: "TP",      render: (v) => ({ text: typeof v === "number" ? v.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "—" }) } as ResultColumn,
      ] : []),
    ];
    const idValues = (h: ExtractModelHeader) => ({
      name: h.name, ticker: h.ticker, country: h.country, kind: h.kind, ccy: h.currency, unit: h.unit,
      updateDate: h.updateDate, analyst: h.analyst, recc: h.recc, tp: h.tp,
    });

    let columns: ResultColumn[];
    let rows: Record<string, unknown>[];

    if (layout === "metrics") {
      columns = [
        ...idCols,
        { key: "metric", label: "Metric", align: "left" },
        ...result.years.map((y) => ({ key: `y${y}`, label: yearLabel(y), group: "Years", render: undefined } as ResultColumn)),
      ];
      rows = [];
      for (const h of headers) {
        const byYear = rowsByTicker.get(h.ticker) ?? new Map();
        for (const id of result.metrics) {
          const def = METRIC_BY_ID.get(id);
          if (def && !metricAppliesTo(def, h.kind)) continue;   // no ensuciar con filas vacías
          const row: Record<string, unknown> = { ...idValues(h), metric: def?.label ?? id };
          for (const y of result.years) row[`y${y}`] = byYear.get(y)?.[id] ?? null;
          rows.push(row);
        }
      }
    } else {
      columns = [
        ...idCols,
        { key: "year", label: "Year", align: "center", render: (v) => ({ text: yearLabel(Number(v)) }) },
        ...result.metrics.map((id) => {
          const def = METRIC_BY_ID.get(id);
          return { key: id, label: def?.label ?? id, group: def?.section, render: (v) => fmtMetric(v, def) } as ResultColumn;
        }),
      ];
      rows = [];
      for (const h of headers) {
        const byYear = rowsByTicker.get(h.ticker) ?? new Map();
        for (const y of result.years) {
          const vals = byYear.get(y);
          if (!vals) continue;
          rows.push({ ...idValues(h), year: y, ...vals });
        }
      }
    }
    return { columns, rows };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, layout, withHeader]);

  // ── Export: misma tabla, valores crudos ────────────────────────────────────
  function buildSheets(): SheetDef[] {
    if (!table) return [];
    const headers = table.columns.map((c) => c.label);
    const rows = table.rows.map((r) => table.columns.map((c) => {
      const v = r[c.key];
      if (c.key === "country" && typeof v === "string") return countryName(v);
      return v == null ? null : (typeof v === "number" ? v : String(v));
    }));
    return [{ name: layout === "metrics" ? "Models (metrics × years)" : "Models (years × metrics)", headers, rows }];
  }

  const canRun = tickers.size > 0 && metricIds.size > 0 && !running;

  if (uLoading) return <Spinner text="Loading model universe…" />;
  if (uError || !universe) return <div style={{ padding: 40, textAlign: "center", color: PATRIA.pink, fontSize: 13 }}>Failed to load universe{uError ? `: ${uError}` : ""}.</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* ── Filtros ──────────────────────────────────────────────────────── */}
      <div className="g-stack-md" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.2fr)", gap: 14, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          <FilterCard title="Model type" hint={`${universe.companies.length} models`}>
            <ChipGroup options={KINDS} selected={kinds} onToggle={(k) => setKinds(toggleIn(kinds, k))} labelOf={(k) => KIND_LABEL[k]} />
          </FilterCard>
          <FilterCard title="Country" hint={countries.size ? `${countries.size} selected` : "all"}>
            <ChipGroup options={universe.countries} selected={countries} onToggle={(c) => setCountries(toggleIn(countries, c))} onNone={() => setCountries(new Set())} labelOf={countryName} />
          </FilterCard>
          <FilterCard title="Sector / Industry" hint={industries.size ? `${industries.size} selected` : "all"}>
            <ChipGroup options={universe.industries} selected={industries} onToggle={(i) => setIndustries(toggleIn(industries, i))} onNone={() => setIndustries(new Set())} />
          </FilterCard>
        </div>

        <FilterCard title="Companies" hint={`${candidates.length} match filters`}>
          <TickerPicker candidates={candidates} selected={tickers} onChange={setTickers} maxHeight={300} />
        </FilterCard>
      </div>

      {/* ── Métricas ─────────────────────────────────────────────────────── */}
      <FilterCard
        title="Metrics"
        hint={
          <span style={{ display: "inline-flex", gap: 10 }}>
            <span>{metricIds.size} selected</span>
            <button type="button" onClick={() => setMetricIds(new Set(visibleMetrics.map((m) => m.id)))} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: PATRIA.kingBlue, fontWeight: 600 }}>all</button>
            <button type="button" onClick={() => setMetricIds(new Set())} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: TEXT.muted, fontWeight: 600 }}>none</button>
          </span>
        }
      >
        <div className="g-stack-sm" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 12 }}>
          {SECTIONS.map((sec) => {
            const list = visibleMetrics.filter((m) => m.section === sec);
            if (list.length === 0) return null;
            return (
              <div key={sec} style={{ minWidth: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: TEXT.label, marginBottom: 5, paddingBottom: 3, borderBottom: `1px solid ${BORDER.base}` }}>{sec}</div>
                {list.map((m) => {
                  const on = metricIds.has(m.id);
                  const bankOnly = !m.company, companyOnly = !m.bank;
                  return (
                    <label key={m.id} style={{ display: "flex", alignItems: "center", gap: 7, padding: "2px 0", cursor: "pointer", fontSize: 12, color: on ? TEXT.body : TEXT.label }}>
                      <input type="checkbox" checked={on} onChange={() => setMetricIds(toggleIn(metricIds, m.id))} style={{ accentColor: PATRIA.kingBlue }} />
                      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.label}</span>
                      {(bankOnly || companyOnly) && selectedKinds.size > 1 && (
                        <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: "0.05em", color: bankOnly ? PATRIA.orange : PATRIA.kingBlue }}>{bankOnly ? "BANK" : "CO"}</span>
                      )}
                    </label>
                  );
                })}
              </div>
            );
          })}
        </div>
      </FilterCard>

      {/* ── Años + acción ────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: TEXT.label }}>Years</span>
        <input value={yearFrom} onChange={(e) => setYearFrom(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="from" inputMode="numeric" style={{ ...CONTROL, width: 74, textAlign: "center" }} />
        <span style={{ color: TEXT.muted }}>→</span>
        <input value={yearTo} onChange={(e) => setYearTo(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="to" inputMode="numeric" style={{ ...CONTROL, width: 74, textAlign: "center" }} />
        <span style={{ fontSize: 11, color: TEXT.muted }}>blank = all years in the model</span>

        <button type="button" onClick={run} disabled={!canRun} style={{ ...PRIMARY_BTN, marginLeft: "auto", opacity: canRun ? 1 : 0.5, cursor: canRun ? "pointer" : "not-allowed" }}>
          {running ? <Loader2 size={14} style={{ animation: "spin 0.8s linear infinite" }} /> : <Play size={14} />}
          {running ? "Running…" : `Run query (${tickers.size} × ${metricIds.size})`}
        </button>
      </div>

      {error && (
        <div style={{ padding: "9px 14px", borderRadius: 8, background: "rgba(248,72,94,0.06)", border: "1px solid rgba(248,72,94,0.22)", color: PATRIA.pink, fontSize: 12 }}>{error}</div>
      )}

      {/* ── Resultado ────────────────────────────────────────────────────── */}
      {result && table && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: TEXT.label, fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums" }}>
              {result.headers.length} compan{result.headers.length === 1 ? "y" : "ies"} · {result.metrics.length} metrics · {result.years.length ? `${result.years[0]}–${result.years[result.years.length - 1]}` : "no years"} · {table.rows.length} rows
            </span>
            <span style={{ fontSize: 11, color: TEXT.muted }}>Values in each model&rsquo;s own currency / unit (CCY, Unit columns).</span>

            <div style={{ marginLeft: "auto", display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <button type="button" onClick={() => setLayout("metrics")} style={{ ...GHOST_BTN, ...(layout === "metrics" ? { borderColor: PATRIA.kingBlue, color: PATRIA.blue, background: "rgba(32,68,220,0.08)" } : {}) }}>
                <Rows3 size={12} /> Metrics as rows
              </button>
              <button type="button" onClick={() => setLayout("years")} style={{ ...GHOST_BTN, ...(layout === "years" ? { borderColor: PATRIA.kingBlue, color: PATRIA.blue, background: "rgba(32,68,220,0.08)" } : {}) }}>
                <Columns3 size={12} /> Years as rows
              </button>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: TEXT.label, marginLeft: 4, cursor: "pointer" }}>
                <input type="checkbox" checked={withHeader} onChange={(e) => setWithHeader(e.target.checked)} style={{ accentColor: PATRIA.kingBlue }} />
                Header cols (Rec, TP, Analyst, Updated)
              </label>
              <ExportButtons
                sheets={buildSheets}
                filename={`models_extract_${new Date().toISOString().slice(0, 10)}`}
                count={table.rows.length}
                pdf={{ title: "Financial Models — Extract", subtitle: `${result.headers.length} companies · ${result.metrics.length} metrics · values in model currency` }}
              />
            </div>
          </div>

          <MetricsTable columns={table.columns} rows={table.rows} layout={layout} metrics={result.metrics} />
        </>
      )}
    </div>
  );
}

// En "metrics as rows" el formato de cada celda depende de la métrica de esa fila, así
// que el render se resuelve acá y no en la definición de columna.
function MetricsTable({ columns, rows, layout, metrics }: { columns: ResultColumn[]; rows: Record<string, unknown>[]; layout: Layout; metrics: string[] }) {
  if (layout !== "metrics") return <ResultTable columns={columns} rows={rows} />;
  const labelToDef = new Map(metrics.map((id) => [METRIC_BY_ID.get(id)?.label ?? id, METRIC_BY_ID.get(id)]));
  // Las celdas de año se pre-formatean como texto según la métrica de su fila; la
  // columna sólo las muestra (gris para "—").
  const shaped = rows.map((r) => {
    const def = labelToDef.get(String(r.metric));
    const out: Record<string, unknown> = { ...r };
    for (const c of columns) if (c.group === "Years") out[c.key] = fmtMetric(r[c.key], def).text;
    return out;
  });
  const cols = columns.map((c) => c.group === "Years"
    ? { ...c, render: (v: unknown) => ({ text: String(v), color: v === "—" ? TEXT.muted : undefined }) }
    : c);
  return <ResultTable columns={cols} rows={shaped} />;
}

function Spinner({ text }: { text: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "60px 0" }}>
      <div style={{ width: 22, height: 22, borderRadius: "50%", border: "2px solid rgba(32,68,220,0.18)", borderTopColor: PATRIA.kingBlue, animation: "spin 0.8s linear infinite" }} />
      <span style={{ fontSize: 12, color: TEXT.label, fontFamily: FONT_SECONDARY }}>{text}</span>
    </div>
  );
}
