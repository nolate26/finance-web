"use client";

import { useEffect, useMemo, useState } from "react";
import { Play, Loader2, Rows3, Columns3, Search } from "lucide-react";
import type { ExtractCompany } from "@/app/api/extract/universe/route";
import type {
  ExtractFichaUniverse, ExtractFichaPayload, ExtractFichaRow, FichaPeriodType,
} from "@/app/api/extract/ficha/route";
import type { SheetDef } from "@/lib/exportExcel";
import ExportButtons from "@/components/ExportButtons";
import { FONT_SECONDARY, PATRIA, TEXT, BORDER } from "@/lib/patriaTheme";
import { FilterCard, ChipGroup, TickerPicker, ResultTable, CONTROL, PRIMARY_BTN, GHOST_BTN, type ResultColumn } from "./ui";

// Ficha — query builder sobre ficha_statements + ficha_kpis (macro "Send Ficha"). Flujo:
// compañías → tipos de período → líneas → años → "Run" pide /api/extract/ficha → la misma
// tabla se ve en pantalla y se exporta a Excel / PDF.
//   · Long  = una fila por compañía × línea × período (lista para tablas dinámicas).
//   · Wide  = compañía × línea en filas, períodos en columnas (como la hoja).
// Los valores van tal cual la ficha: moneda reportada, millones; CCY y FX van en columnas.

type Layout = "long" | "wide";
const PERIOD_TYPES: FichaPeriodType[] = ["A", "Q", "L", "Y"];
const PERIOD_LABEL: Record<FichaPeriodType, string> = { A: "Annual", Q: "Quarterly", L: "LTM", Y: "Year-to-date" };

const fmtVal = (v: unknown) =>
  typeof v === "number" ? { text: Math.abs(v) >= 100 ? Math.round(v).toLocaleString("en-US") : v.toLocaleString("en-US", { maximumFractionDigits: 4 }) } : { text: "—", color: TEXT.muted };

export default function FichaExtractor() {
  const [universe, setUniverse] = useState<ExtractFichaUniverse | null>(null);
  const [uError, setUError] = useState<string | null>(null);

  const [tickers, setTickers] = useState<Set<string>>(new Set());
  const [types, setTypes] = useState<Set<FichaPeriodType>>(new Set(["A", "Q"]));
  const [lines, setLines] = useState<Set<string>>(new Set());   // vacío = todas
  const [lineQ, setLineQ] = useState("");
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [layout, setLayout] = useState<Layout>("wide");

  const [result, setResult] = useState<ExtractFichaPayload | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/extract/ficha")
      .then((r) => r.json())
      .then((d: ExtractFichaUniverse & { error?: string }) => { if (d.error) setUError(d.error); else setUniverse(d); })
      .catch(() => setUError("network error"));
  }, []);

  // TickerPicker espera el universo de modelos: se adapta (industria + última ficha en la línea chica).
  const candidates: ExtractCompany[] = useMemo(() => (universe?.companies ?? []).map((c) => ({
    ticker: c.ticker, name: c.name, country: null,
    industry: [c.industry, `last ${c.lastLabel}`, c.currency].filter(Boolean).join(" · "),
    kind: "company", updateDate: c.updatedAt, analyst: null, yearMin: null, yearMax: null,
  })), [universe]);

  const toggleIn = <T,>(set: Set<T>, v: T): Set<T> => { const n = new Set(set); if (n.has(v)) n.delete(v); else n.add(v); return n; };

  // Líneas agrupadas por sección (estados en el orden de la hoja, después los KPIs).
  const lineGroups = useMemo(() => {
    const q = lineQ.trim().toLowerCase();
    const groups: { title: string; items: ExtractFichaUniverse["lines"] }[] = [];
    for (const l of universe?.lines ?? []) {
      if (q && !l.line.toLowerCase().includes(q) && !l.section.toLowerCase().includes(q)) continue;
      const title = l.source === "kpi" ? `KPIs · ${l.section}` : l.section;
      let g = groups.find((x) => x.title === title);
      if (!g) { g = { title, items: [] }; groups.push(g); }
      g.items.push(l);
    }
    return groups;
  }, [universe, lineQ]);

  async function run() {
    if (!tickers.size || !types.size) return;
    setRunning(true); setError(null);
    try {
      const res = await fetch("/api/extract/ficha", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tickers: [...tickers], periodTypes: PERIOD_TYPES.filter((t) => types.has(t)),
          lines: [...lines],
          yearFrom: yearFrom ? Number(yearFrom) : undefined, yearTo: yearTo ? Number(yearTo) : undefined,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      setResult(d as ExtractFichaPayload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Query failed");
    } finally {
      setRunning(false);
    }
  }

  // ── Pivot ──────────────────────────────────────────────────────────────────
  const table = useMemo(() => {
    if (!result) return null;
    const idCols: ResultColumn[] = [
      { key: "name", label: "Company", align: "left", sticky: true },
      { key: "ticker", label: "Ticker", align: "left" },
      { key: "ccy", label: "CCY", align: "left" },
    ];
    if (layout === "long") {
      const columns: ResultColumn[] = [
        ...idCols,
        { key: "fx", label: "FX", render: (v) => ({ text: typeof v === "number" ? v.toLocaleString("en-US") : "—" }) },
        { key: "section", label: "Section", align: "left" },
        { key: "line", label: "Line", align: "left" },
        { key: "type", label: "Type", align: "center" },
        { key: "period", label: "Period", align: "left" },
        { key: "periodEnd", label: "Period end", align: "left" },
        { key: "value", label: "Value", render: fmtVal },
      ];
      const rows: Record<string, unknown>[] = result.rows.map((r) => ({
        name: r.name, ticker: r.ticker, ccy: r.currency, fx: r.fx,
        section: r.source === "kpi" ? `KPIs · ${r.section}` : r.section, line: r.line,
        type: PERIOD_LABEL[r.periodType], period: r.period, periodEnd: r.periodEnd, value: r.value,
      }));
      return { columns, rows };
    }
    // Wide: columnas = períodos ordenados por tipo (años, LTM, acumulados, trimestres) y fecha.
    const typeRank: Record<FichaPeriodType, number> = { A: 0, L: 1, Y: 2, Q: 3 };
    const periods = new Map<string, { label: string; t: FichaPeriodType; end: string }>();
    for (const r of result.rows) {
      const k = `${r.periodType}|${r.year}|${r.quarter}`;
      if (!periods.has(k)) periods.set(k, { label: r.period, t: r.periodType, end: r.periodEnd });
    }
    const pcols = [...periods.entries()].sort((a, b) => typeRank[a[1].t] - typeRank[b[1].t] || a[1].end.localeCompare(b[1].end));
    const columns: ResultColumn[] = [
      ...idCols,
      { key: "section", label: "Section", align: "left" },
      { key: "line", label: "Line", align: "left" },
      ...pcols.map(([k, p]) => ({ key: `p:${k}`, label: p.label, group: PERIOD_LABEL[p.t], render: fmtVal } as ResultColumn)),
    ];
    const byRow = new Map<string, Record<string, unknown>>();
    for (const r of result.rows as ExtractFichaRow[]) {
      const rk = `${r.ticker}|${r.source}|${r.section}|${r.line}`;
      let row = byRow.get(rk);
      if (!row) {
        row = { name: r.name, ticker: r.ticker, ccy: r.currency, section: r.source === "kpi" ? `KPIs · ${r.section}` : r.section, line: r.line };
        byRow.set(rk, row);
      }
      row[`p:${r.periodType}|${r.year}|${r.quarter}`] = r.value;
    }
    return { columns, rows: [...byRow.values()] };
  }, [result, layout]);

  function buildSheets(): SheetDef[] {
    if (!table) return [];
    return [{
      name: layout === "long" ? "Ficha (long)" : "Ficha (wide)",
      headers: table.columns.map((c) => c.label),
      rows: table.rows.map((r) => table.columns.map((c) => {
        const v = r[c.key];
        return v == null ? null : typeof v === "number" ? v : String(v);
      })),
    }];
  }

  const canRun = tickers.size > 0 && types.size > 0 && !running;
  const nCompanies = result ? new Set(result.rows.map((r) => r.ticker)).size : 0;

  if (uError) return <div style={{ padding: 40, textAlign: "center", color: PATRIA.pink, fontSize: 13 }}>Failed to load fichas: {uError}.</div>;
  if (!universe) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "60px 0" }}>
      <div style={{ width: 22, height: 22, borderRadius: "50%", border: "2px solid rgba(32,68,220,0.18)", borderTopColor: PATRIA.kingBlue, animation: "spin 0.8s linear infinite" }} />
      <span style={{ fontSize: 12, color: TEXT.label, fontFamily: FONT_SECONDARY }}>Loading fichas…</span>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="g-stack-md" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.2fr)", gap: 14, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          <FilterCard title="Companies" hint={`${universe.companies.length} fichas`}>
            <TickerPicker candidates={candidates} selected={tickers} onChange={setTickers} maxHeight={300} />
          </FilterCard>
          <FilterCard title="Period type" hint={`${types.size} selected`}>
            <ChipGroup options={PERIOD_TYPES} selected={types} onToggle={(t) => setTypes(toggleIn(types, t))} labelOf={(t) => PERIOD_LABEL[t]} />
          </FilterCard>
        </div>

        <FilterCard
          title="Lines"
          hint={
            <span style={{ display: "inline-flex", gap: 10 }}>
              <span>{lines.size ? `${lines.size} selected` : "all"}</span>
              <button type="button" onClick={() => setLines(new Set())} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: PATRIA.kingBlue, fontWeight: 600 }}>all</button>
            </span>
          }
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, ...CONTROL, padding: "5px 9px", marginBottom: 8 }}>
            <Search size={13} style={{ color: TEXT.muted, flexShrink: 0 }} />
            <input value={lineQ} onChange={(e) => setLineQ(e.target.value)} placeholder="Search line or section…"
              style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", fontSize: 12, color: TEXT.body, fontFamily: FONT_SECONDARY }} />
          </div>
          <div style={{ maxHeight: 360, overflowY: "auto", border: `1px solid ${BORDER.base}`, borderRadius: 8, background: "#fff", padding: "6px 10px" }}>
            {lineGroups.length === 0 && <div style={{ padding: 10, fontSize: 12, color: TEXT.muted, textAlign: "center" }}>No lines match.</div>}
            {lineGroups.map((g) => {
              const allOn = g.items.every((l) => lines.has(l.key));
              return (
                <div key={g.title} style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: TEXT.label, padding: "3px 0", borderBottom: `1px solid ${BORDER.base}`, marginBottom: 3 }}>
                    <span style={{ flex: 1 }}>{g.title}</span>
                    <button type="button" onClick={() => {
                      const n = new Set(lines);
                      for (const l of g.items) { if (allOn) n.delete(l.key); else n.add(l.key); }
                      setLines(n);
                    }} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: PATRIA.kingBlue, fontWeight: 700, fontSize: 10, letterSpacing: 0, textTransform: "none" }}>
                      {allOn ? "none" : "select section"}
                    </button>
                  </div>
                  <div className="g-stack-sm" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", columnGap: 12 }}>
                    {g.items.map((l) => (
                      <label key={l.key} style={{ display: "flex", alignItems: "center", gap: 7, padding: "2px 0", cursor: "pointer", fontSize: 12, color: lines.has(l.key) ? TEXT.body : TEXT.label, minWidth: 0 }}>
                        <input type="checkbox" checked={lines.has(l.key)} onChange={() => setLines(toggleIn(lines, l.key))} style={{ accentColor: PATRIA.kingBlue }} />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.line}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: TEXT.muted, marginTop: 6 }}>No line ticked = every line of the ficha.</div>
        </FilterCard>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: TEXT.label }}>Years</span>
        <input value={yearFrom} onChange={(e) => setYearFrom(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="from" inputMode="numeric" style={{ ...CONTROL, width: 74, textAlign: "center" }} />
        <span style={{ color: TEXT.muted }}>→</span>
        <input value={yearTo} onChange={(e) => setYearTo(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="to" inputMode="numeric" style={{ ...CONTROL, width: 74, textAlign: "center" }} />
        <span style={{ fontSize: 11, color: TEXT.muted }}>
          blank = all years{universe.years.length ? ` (${universe.years[0]}–${universe.years[universe.years.length - 1]})` : ""}
        </span>
        <button type="button" onClick={run} disabled={!canRun} style={{ ...PRIMARY_BTN, marginLeft: "auto", opacity: canRun ? 1 : 0.5, cursor: canRun ? "pointer" : "not-allowed" }}>
          {running ? <Loader2 size={14} style={{ animation: "spin 0.8s linear infinite" }} /> : <Play size={14} />}
          {running ? "Running…" : `Run query (${tickers.size} × ${lines.size || "all"} lines)`}
        </button>
      </div>

      {error && (
        <div style={{ padding: "9px 14px", borderRadius: 8, background: "rgba(248,72,94,0.06)", border: "1px solid rgba(248,72,94,0.22)", color: PATRIA.pink, fontSize: 12 }}>{error}</div>
      )}

      {result && table && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: TEXT.label, fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums" }}>
              {nCompanies} compan{nCompanies === 1 ? "y" : "ies"} · {result.rows.length.toLocaleString("en-US")} values · {table.rows.length.toLocaleString("en-US")} rows
              {result.truncated && <b style={{ color: PATRIA.pink }}> · truncated, narrow the query</b>}
            </span>
            <span style={{ fontSize: 11, color: TEXT.muted }}>Values as in the ficha: reported currency, millions (CCY / FX columns to convert).</span>
            <div style={{ marginLeft: "auto", display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <button type="button" onClick={() => setLayout("wide")} style={{ ...GHOST_BTN, ...(layout === "wide" ? { borderColor: PATRIA.kingBlue, color: PATRIA.blue, background: "rgba(32,68,220,0.08)" } : {}) }}>
                <Columns3 size={12} /> Periods as columns
              </button>
              <button type="button" onClick={() => setLayout("long")} style={{ ...GHOST_BTN, ...(layout === "long" ? { borderColor: PATRIA.kingBlue, color: PATRIA.blue, background: "rgba(32,68,220,0.08)" } : {}) }}>
                <Rows3 size={12} /> One row per value
              </button>
              <ExportButtons
                sheets={buildSheets}
                filename={`ficha_extract_${new Date().toISOString().slice(0, 10)}`}
                count={table.rows.length}
                pdf={{ title: "Ficha — Extract", subtitle: `${nCompanies} companies · values in reported currency, millions` }}
              />
            </div>
          </div>
          <ResultTable columns={table.columns} rows={table.rows} />
        </>
      )}
    </div>
  );
}
