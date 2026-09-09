"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Download, Loader2, Settings2, Table2, List, Trash2, Info } from "lucide-react";
import { downloadExcel } from "@/lib/exportExcel";
import { useIsAdmin } from "@/lib/useIsAdmin";
import { FONT_SECONDARY, TEXT, BORDER, PATRIA } from "@/lib/patriaTheme";
import type { PickSectorDTO, PickSectorsPayload, TopPickDTO, TopPicksPayload } from "@/lib/topPicks";
import AddPickModal from "./AddPickModal";
import PickSectorAdmin from "./PickSectorAdmin";

// Top Picks, agrupados por SECTOR.
//
// La Summary Table es la vista de entrada: es la foto que el equipo mira —qué se
// recomendó por sector, período a período—. La vista de detalle queda como segunda
// pestaña, para leer comentarios y editar.
//
// LEGACY: un pick cuyo autor ya no es miembro del sector llega con isLegacy = true
// desde el servidor (se deriva de pick_sector_members, no hay columna que mantener) y
// se pinta en gris con el nombre del analista saliente al lado.

type Region = "CHILE" | "LATAM";
type View   = "summary" | "detail";

interface Props {
  defaultRegion?: Region;
  region?:        Region;
}

const UNASSIGNED = "__unassigned__";
const UNASSIGNED_LABEL = "Unassigned";

// ── Fechas ────────────────────────────────────────────────────────────────────
function periodLabel(ym: string, isChile: boolean): string {
  const [year, month] = ym.split("-").map(Number);
  if (isChile) return `Q${Math.ceil(month / 3)} ${year}`;
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function currentPeriod(isChile: boolean): string {
  const d = new Date();
  const m = isChile ? Math.floor(d.getMonth() / 3) * 3 : d.getMonth();
  return `${d.getFullYear()}-${String(m + 1).padStart(2, "0")}`;
}

export default function TopPicksPanel({ defaultRegion, region: regionProp }: Props) {
  const region  = (regionProp ?? defaultRegion ?? "LATAM") as Region;
  const isChile = region === "CHILE";
  const isAdmin = useIsAdmin();

  const [view, setView]         = useState<View>("summary");   // Summary Table por defecto
  const [periods, setPeriods]   = useState<string[]>([]);
  const [byPeriod, setByPeriod] = useState<Record<string, TopPickDTO[]>>({});
  const [sectors, setSectors]   = useState<PickSectorDTO[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [addOpen, setAddOpen]   = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [detailPeriod, setDetailPeriod] = useState<string>(() => currentPeriod(isChile));
  const [busyId, setBusyId]     = useState<string | null>(null);

  // ── Carga ───────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setError(null);
    try {
      const [pRes, sRes] = await Promise.all([
        fetch(`/api/top-picks/periods?region=${region}`),
        fetch(`/api/pick-sectors?region=${region}`),
      ]);
      const pJson: { periods?: string[] } = pRes.ok ? await pRes.json() : { periods: [] };
      const sJson: PickSectorsPayload & { error?: string } = await sRes.json();
      if (!sRes.ok) throw new Error(sJson.error ?? "No se pudieron cargar los sectores");

      // El período actual siempre está disponible aunque todavía no tenga picks:
      // si no, no habría dónde agregar el primero del mes.
      const list = [...new Set([currentPeriod(isChile), ...(pJson.periods ?? [])])].sort().reverse();
      setPeriods(list);
      setSectors(sJson.sectors);

      const entries = await Promise.all(list.map(async (ym) => {
        const r = await fetch(`/api/top-picks?region=${region}&period_date=${ym}-01`);
        const d: TopPicksPayload = r.ok ? await r.json() : { picks: [] };
        return [ym, d.picks] as const;
      }));
      const data = Object.fromEntries(entries);
      setByPeriod(data);

      // El detalle abre en el período más reciente CON picks, no en el calendario.
      // El período actual siempre se inyecta en la lista para poder empezar a cargar
      // el mes en curso, pero si todavía está vacío abrirlo ahí muestra una pantalla
      // en blanco teniendo datos una columna más allá.
      setDetailPeriod((prev) => {
        if (prev && (data[prev] ?? []).length > 0) return prev;
        return list.find((ym) => (data[ym] ?? []).length > 0) ?? list[0] ?? currentPeriod(isChile);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de carga");
    } finally {
      setLoading(false);
    }
  // detailPeriod se omite a propósito: recargar todo al cambiar de período sería
  // gratuito, los datos de todos los períodos ya están en memoria.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region, isChile]);

  useEffect(() => { load(); }, [load]);

  // ── Derivados ───────────────────────────────────────────────────────────────
  const allPicks = useMemo(() => Object.values(byPeriod).flat(), [byPeriod]);

  /** Filas de la Summary Table: sectores con picks, más el bucket Unassigned. */
  const rowSectors = useMemo(() => {
    const used = new Map<string, string>();
    for (const p of allPicks) used.set(p.sectorId ?? UNASSIGNED, p.sectorName ?? UNASSIGNED_LABEL);
    // Sectores sin picks también se listan: dejan ver que existen y están vacíos.
    for (const s of sectors) if (!used.has(s.id)) used.set(s.id, s.name);
    // Las siglas de quien cubre el sector viajan con la fila: el eje es el analista,
    // así que saber quién responde por cada sector importa tanto como el nombre.
    const initialsOf = (id: string) => {
      const sec = sectors.find((x) => x.id === id);
      if (!sec) return "";
      return sec.members
        .map((m) => m.initials ?? (m.name ?? m.email ?? "?").slice(0, 2).toUpperCase())
        .join(" · ");
    };
    const rows = [...used.entries()].map(([id, name]) => ({ id, name, analysts: initialsOf(id) }));
    rows.sort((a, b) => {
      if (a.id === UNASSIGNED) return 1;   // Unassigned siempre al final
      if (b.id === UNASSIGNED) return -1;
      const ia = sectors.findIndex((s) => s.id === a.id);
      const ib = sectors.findIndex((s) => s.id === b.id);
      return (ia < 0 ? 9e9 : ia) - (ib < 0 ? 9e9 : ib) || a.name.localeCompare(b.name);
    });
    return rows;
  }, [allPicks, sectors]);

  const activePeriods = useMemo(
    () => periods.filter((p) => (byPeriod[p] ?? []).length > 0),
    [periods, byPeriod],
  );

  const writable = useMemo(() => sectors.filter((s) => s.canWrite), [sectors]);
  const takenInPeriod = useMemo(
    () => new Set((byPeriod[detailPeriod] ?? []).map((p) => p.nombreLatam)),
    [byPeriod, detailPeriod],
  );

  // ── Export ──────────────────────────────────────────────────────────────────
  // Reproduce EXACTAMENTE la grilla de la web: una fila por sector, una columna por
  // período, y en cada celda los nombres (con TP entre paréntesis en Chile). Los
  // legacy van marcados con "(legacy)" porque en Excel no hay gris que valga.
  async function exportSummary() {
    const headers = ["Sector", ...activePeriods.map((p) => periodLabel(p, isChile))];
    const rows = rowSectors.map((sec) => [
      sec.name,
      ...activePeriods.map((period) => {
        const cell = (byPeriod[period] ?? []).filter((p) => (p.sectorId ?? UNASSIGNED) === sec.id);
        if (cell.length === 0) return "—";
        return cell.map((p) => {
          const tp = isChile && p.targetPrice != null
            ? ` (${p.targetPrice.toLocaleString("en-US", { maximumFractionDigits: 0 })})`
            : "";
          return `${p.nombreLatam}${tp}${p.isLegacy ? " (legacy)" : ""}`;
        }).join("\n");
      }),
    ]);
    await downloadExcel(
      [{ name: "Top Picks", headers, rows }],
      `top_picks_${region.toLowerCase()}`,
    );
  }

  // ── Acciones ────────────────────────────────────────────────────────────────
  /**
   * Mueve un pick a otro sector. Sólo cambia la ubicación: NO reescribe la autoría,
   * así que un pick de Harry Klenner movido de sector sigue siendo suyo y sigue en
   * gris si tampoco es miembro del sector destino.
   */
  async function movePick(pick: TopPickDTO, sectorId: string) {
    if (sectorId === (pick.sectorId ?? "")) return;
    setBusyId(pick.id);
    setError(null);
    try {
      const res = await fetch(`/api/top-picks/${pick.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectorId: sectorId || null }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "No se pudo mover");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo mover");
    } finally {
      setBusyId(null);
    }
  }

  /** Guarda un campo suelto del pick (precio objetivo, comentario). */
  async function editPick(pick: TopPickDTO, patch: Record<string, unknown>) {
    setBusyId(pick.id);
    setError(null);
    try {
      const res = await fetch(`/api/top-picks/${pick.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "No se pudo guardar");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setBusyId(null);
    }
  }

  async function removePick(pick: TopPickDTO) {
    if (!confirm(`¿Quitar ${pick.nombreLatam} de los Top Picks de ${periodLabel(detailPeriod, isChile)}?`)) return;
    setBusyId(pick.id);
    setError(null);
    try {
      const res = await fetch(`/api/top-picks/${pick.id}`, { method: "DELETE" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "No se pudo quitar");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo quitar");
    } finally {
      setBusyId(null);
    }
  }

  const canWriteAnything = isAdmin || writable.length > 0;

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "60px 24px", gap: 10 }}>
        <Loader2 size={16} style={{ animation: "spin 0.8s linear infinite", color: PATRIA.kingBlue }} />
        <span style={{ fontSize: 13, color: TEXT.label }}>Loading top picks…</span>
      </div>
    );
  }

  return (
    <div>
      {/* ── Barra de control ─────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{
          display: "inline-flex", background: "rgba(13,13,56,0.04)",
          border: `1px solid ${BORDER.base}`, borderRadius: 9, padding: 3,
        }}>
          {([["summary", "Summary Table", Table2], ["detail", "Detail", List]] as const).map(([k, label, Icon]) => {
            const on = view === k;
            return (
              <button
                key={k}
                onClick={() => setView(k)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "6px 13px", fontSize: 12, fontWeight: on ? 700 : 600,
                  background: on ? "#FFFFFF" : "transparent",
                  color: on ? PATRIA.darkBlue : TEXT.label,
                  border: on ? `1px solid ${BORDER.base}` : "1px solid transparent",
                  boxShadow: on ? "0 1px 3px rgba(13,13,56,0.09)" : "none",
                  borderRadius: 7, cursor: "pointer", whiteSpace: "nowrap",
                }}
              >
                <Icon size={12} /> {label}
              </button>
            );
          })}
        </div>

        {view === "detail" && (
          <select
            value={detailPeriod}
            onChange={(e) => setDetailPeriod(e.target.value)}
            style={{
              padding: "6px 11px", borderRadius: 8, fontSize: 12.5,
              border: `1px solid ${BORDER.base}`, background: "#F5F7FD",
              color: PATRIA.darkBlue, cursor: "pointer", outline: "none",
            }}
          >
            {periods.map((p) => <option key={p} value={p}>{periodLabel(p, isChile)}</option>)}
          </select>
        )}

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {view === "summary" && activePeriods.length > 0 && (
            <button onClick={exportSummary} style={ghostBtn}>
              <Download size={12} /> Excel
            </button>
          )}
          {isAdmin && (
            <button onClick={() => setAdminOpen(true)} style={ghostBtn}>
              <Settings2 size={12} /> Sectors
            </button>
          )}
          {canWriteAnything && (
            <button
              onClick={() => { setView("detail"); setAddOpen(true); }}
              style={{ ...ghostBtn, background: PATRIA.blue, color: "#FFFFFF", border: "none" }}
            >
              <Plus size={12} /> Add pick
            </button>
          )}
        </div>
      </div>

      {error && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          fontSize: 12.5, color: "#B01029", background: "rgba(248,72,94,0.07)",
          border: "1px solid rgba(248,72,94,0.22)", borderRadius: 9,
          padding: "10px 14px", marginBottom: 12,
        }}>
          <span style={{ flex: 1 }}>{error}</span>
          <button onClick={() => setError(null)} style={{ background: "none", border: "none", color: "#B01029", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>OK</button>
        </div>
      )}

      {sectors.length === 0 && isAdmin && (
        <div style={{
          display: "flex", alignItems: "center", gap: 9,
          fontSize: 12.5, color: "#8A3A00", background: "rgba(255,187,141,0.20)",
          border: "1px solid rgba(255,107,6,0.30)", borderRadius: 9,
          padding: "10px 14px", marginBottom: 12,
        }}>
          <Info size={14} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>
            Todavía no hay sectores. Créalos en <strong>Sectors</strong> — o cópialos desde Team Planning con un click.
          </span>
        </div>
      )}

      {view === "summary"
        ? <SummaryTable
            rowSectors={rowSectors}
            activePeriods={activePeriods}
            byPeriod={byPeriod}
            isChile={isChile}
          />
        : <DetailList
            picks={byPeriod[detailPeriod] ?? []}
            rowSectors={rowSectors}
            sectors={sectors}
            isAdmin={isAdmin}
            busyId={busyId}
            onRemove={removePick}
            onMove={movePick}
            onEdit={editPick}
            isChile={isChile}
          />}

      {addOpen && (
        <AddPickModal
          region={region}
          periodIso={`${detailPeriod}-01`}
          sectors={isAdmin ? sectors : writable}
          taken={takenInPeriod}
          onClose={() => setAddOpen(false)}
          onAdded={load}
        />
      )}

      {adminOpen && (
        <PickSectorAdmin
          region={region}
          sectors={sectors}
          onClose={() => setAdminOpen(false)}
          onChanged={load}
        />
      )}
    </div>
  );
}

// ── Summary Table ─────────────────────────────────────────────────────────────
function SummaryTable({
  rowSectors, activePeriods, byPeriod, isChile,
}: {
  rowSectors:    { id: string; name: string; analysts: string }[];
  activePeriods: string[];
  byPeriod:      Record<string, TopPickDTO[]>;
  isChile:       boolean;
}) {
  if (activePeriods.length === 0) {
    return (
      <div style={{ padding: "48px 24px", textAlign: "center", color: TEXT.muted, fontSize: 13 }}>
        No picks yet.
      </div>
    );
  }

  return (
    <div style={{ background: "#FFFFFF", border: `1px solid ${BORDER.base}`, borderRadius: 12, boxShadow: "0 1px 4px rgba(13,13,56,0.06)", overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", fontSize: 12, tableLayout: "auto", width: "100%" }}>
        <thead>
          <tr>
            <th style={{ ...thBase, position: "sticky", left: 0, zIndex: 2, textAlign: "left", minWidth: 180, borderRight: `1px solid ${BORDER.base}` }}>
              Sector
            </th>
            {activePeriods.map((p) => (
              <th key={p} style={{ ...thBase, textAlign: "center", minWidth: 155, borderLeft: `1px solid ${BORDER.subtle}` }}>
                {periodLabel(p, isChile)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rowSectors.map((sec, rowIdx) => {
            const zebra = rowIdx % 2 === 1;
            const unassigned = sec.id === UNASSIGNED;
            return (
              <tr key={sec.id}>
                <td style={{
                  position: "sticky", left: 0, zIndex: 1,
                  background: zebra ? "#F5F7FD" : "#FFFFFF",
                  padding: "11px 18px 11px 12px",
                  borderBottom: `1px solid ${BORDER.subtle}`,
                  borderRight: `1px solid ${BORDER.base}`,
                  borderLeft: `3px solid ${unassigned ? "rgba(13,13,56,0.18)" : PATRIA.kingBlue}`,
                  verticalAlign: "top",
                }}>
                  <span style={{
                    display: "block",
                    fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap",
                    color: unassigned ? TEXT.muted : PATRIA.blue,
                    fontStyle: unassigned ? "italic" : "normal",
                  }}>
                    {sec.name}
                  </span>
                  {/* Quién cubre el sector hoy. Vacío = sin analista asignado. */}
                  {!unassigned && (
                    <span style={{
                      display: "block", marginTop: 2,
                      fontSize: 9.5, fontWeight: 700, fontFamily: FONT_SECONDARY,
                      color: sec.analysts ? TEXT.muted : "rgba(255,107,6,0.75)",
                      whiteSpace: "nowrap",
                    }}>
                      {sec.analysts || "sin analista"}
                    </span>
                  )}
                </td>

                {activePeriods.map((period) => {
                  const cell = (byPeriod[period] ?? []).filter((p) => (p.sectorId ?? UNASSIGNED) === sec.id);
                  return (
                    <td key={period} style={{
                      padding: "11px 14px",
                      borderBottom: `1px solid ${BORDER.subtle}`,
                      borderLeft: `1px solid ${BORDER.subtle}`,
                      verticalAlign: "top",
                      background: zebra ? "rgba(13,13,56,0.013)" : "transparent",
                    }}>
                      {cell.length === 0 ? (
                        <span style={{ color: "rgba(13,13,56,0.14)", fontSize: 12 }}>—</span>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                          {cell.map((p) => <PickChip key={p.id} pick={p} isChile={isChile} />)}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Nombre de empresa, gris si es legacy ──────────────────────────────────────
function PickChip({ pick, isChile }: { pick: TopPickDTO; isChile: boolean }) {
  return (
    <div
      title={pick.isLegacy
        ? `Legacy — ${pick.authorName ?? "analista anterior"} ya no es miembro de este sector`
        : pick.comment || undefined}
      style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}
    >
      <span style={{
        fontSize: 12, fontWeight: pick.isLegacy ? 500 : 600, lineHeight: 1.2, whiteSpace: "nowrap",
        color: pick.isLegacy ? "rgba(13,13,56,0.38)" : PATRIA.darkBlue,
      }}>
        {pick.nombreLatam}
      </span>

      {isChile && pick.targetPrice != null && (
        <span style={{
          fontSize: 10, fontWeight: 700, whiteSpace: "nowrap",
          fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums",
          color:      pick.isLegacy ? "rgba(13,13,56,0.38)" : PATRIA.blue,
          background: pick.isLegacy ? "rgba(13,13,56,0.05)" : "rgba(32,68,220,0.08)",
          border: `1px solid ${pick.isLegacy ? "rgba(13,13,56,0.12)" : "rgba(32,68,220,0.22)"}`,
          borderRadius: 4, padding: "1px 6px",
        }}>
          {pick.targetPrice.toLocaleString("en-US", { maximumFractionDigits: 0 })}
        </span>
      )}

      {/* El analista saliente se nombra: es la razón de que el pick esté gris. */}
      {pick.isLegacy && pick.authorName && (
        <span style={{ fontSize: 9, color: "rgba(13,13,56,0.32)", fontStyle: "italic", whiteSpace: "nowrap" }}>
          {pick.authorName}
        </span>
      )}
    </div>
  );
}

// ── Detalle ───────────────────────────────────────────────────────────────────
function DetailList({
  picks, rowSectors, sectors, isAdmin, busyId, onRemove, onMove, onEdit, isChile,
}: {
  picks:      TopPickDTO[];
  rowSectors: { id: string; name: string; analysts: string }[];
  sectors:    PickSectorDTO[];
  isAdmin:    boolean;
  busyId:     string | null;
  onRemove:   (p: TopPickDTO) => void;
  onMove:     (p: TopPickDTO, sectorId: string) => void;
  onEdit:     (p: TopPickDTO, patch: Record<string, unknown>) => void;
  isChile:    boolean;
}) {
  if (picks.length === 0) {
    return (
      <div style={{ padding: "48px 24px", textAlign: "center", color: TEXT.muted, fontSize: 13 }}>
        No picks in this period yet. Use <strong>Add pick</strong> to start.
      </div>
    );
  }

  const groups = rowSectors
    .map((sec) => ({ sec, rows: picks.filter((p) => (p.sectorId ?? UNASSIGNED) === sec.id) }))
    .filter((g) => g.rows.length > 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {groups.map(({ sec, rows }) => {
        const canWrite = isAdmin || sectors.find((s) => s.id === sec.id)?.canWrite === true;
        return (
          <div key={sec.id} style={{ background: "#FFFFFF", border: `1px solid ${BORDER.base}`, borderRadius: 12, overflow: "hidden" }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "9px 13px", background: "#F5F7FD", borderBottom: `1px solid ${BORDER.subtle}`,
            }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: PATRIA.darkBlue }}>{sec.name}</span>
              <span style={{ fontSize: 10, color: TEXT.muted, fontFamily: FONT_SECONDARY }}>{rows.length}</span>
              {!canWrite && (
                <span style={{ fontSize: 9.5, color: TEXT.muted, marginLeft: "auto" }}>read only</span>
              )}
            </div>

            {rows.map((p) => (
              <div key={p.id} style={{
                display: "flex", alignItems: "flex-start", gap: 10,
                padding: "10px 13px", borderBottom: `1px solid ${BORDER.subtle}`,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                    <span style={{
                      fontSize: 12.5, fontWeight: p.isLegacy ? 500 : 700,
                      color: p.isLegacy ? "rgba(13,13,56,0.38)" : PATRIA.darkBlue,
                    }}>
                      {p.nombreLatam}
                    </span>
                    {p.isLegacy && (
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 4,
                        background: "rgba(13,13,56,0.05)", color: "rgba(13,13,56,0.40)",
                        border: "1px solid rgba(13,13,56,0.12)", whiteSpace: "nowrap",
                      }}>
                        legacy · {p.authorName ?? "analista anterior"}
                      </span>
                    )}
                    {!p.isLegacy && p.authorName && (
                      <span style={{ fontSize: 9.5, color: TEXT.muted, fontFamily: FONT_SECONDARY }}>
                        {p.authorInitials ?? p.authorName}
                      </span>
                    )}
                  </div>
                  {/* Comentario editable en el lugar: se guarda al salir del campo.
                      Sin modal de por medio, que para corregir una línea sobra. */}
                  {canWrite ? (
                    <textarea
                      defaultValue={p.comment}
                      onBlur={(e) => {
                        if (e.target.value !== p.comment) onEdit(p, { comment: e.target.value });
                      }}
                      rows={p.comment ? 2 : 1}
                      placeholder="Sin comentario — click para escribir"
                      style={{
                        width: "100%", boxSizing: "border-box", marginTop: 3,
                        padding: "4px 7px", borderRadius: 6, resize: "vertical",
                        border: "1px solid transparent", background: "transparent",
                        fontSize: 11.5, lineHeight: 1.5, fontFamily: "inherit",
                        color: p.isLegacy ? "rgba(13,13,56,0.32)" : TEXT.label,
                        outline: "none",
                      }}
                      onFocus={(e) => {
                        e.currentTarget.style.background = "#F5F7FD";
                        e.currentTarget.style.borderColor = BORDER.base;
                      }}
                      onMouseEnter={(e) => { if (document.activeElement !== e.currentTarget) e.currentTarget.style.borderColor = BORDER.subtle; }}
                      onMouseLeave={(e) => { if (document.activeElement !== e.currentTarget) e.currentTarget.style.borderColor = "transparent"; }}
                    />
                  ) : p.comment ? (
                    <p style={{
                      fontSize: 11.5, lineHeight: 1.5, margin: "3px 0 0",
                      color: p.isLegacy ? "rgba(13,13,56,0.32)" : TEXT.label,
                      whiteSpace: "pre-wrap",
                    }}>
                      {p.comment}
                    </p>
                  ) : null}
                </div>

                {/* Precio objetivo editable. Vacío borra el valor (queda NULL), que es
                    distinto de un 0 — hoy hay picks con 0 que probablemente sean eso. */}
                {canWrite ? (
                  <TargetPriceInput
                    pick={p}
                    disabled={busyId === p.id}
                    onSave={(v) => onEdit(p, { targetPrice: v })}
                  />
                ) : p.targetPrice != null ? (
                  <span style={{
                    fontSize: 11, fontWeight: 800, flexShrink: 0,
                    fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums",
                    color: p.isLegacy ? "rgba(13,13,56,0.38)" : PATRIA.blue,
                  }}>
                    {p.targetPrice.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                  </span>
                ) : null}

                {/* Mover de sector. Es un select y no un drag: la lista está agrupada
                    y con scroll, así que elegir el destino por nombre es más directo
                    que arrastrar entre grupos. Sólo destinos donde puedas escribir. */}
                {canWrite && (
                  <select
                    value={p.sectorId ?? ""}
                    disabled={busyId === p.id}
                    onChange={(e) => onMove(p, e.target.value)}
                    title="Mover a otro sector"
                    style={{
                      flexShrink: 0, maxWidth: 150, padding: "3px 6px", borderRadius: 6,
                      border: `1px solid ${BORDER.base}`, background: "#F5F7FD",
                      color: TEXT.label, fontSize: 10.5, cursor: "pointer", outline: "none",
                    }}
                  >
                    {sectors.filter((x) => isAdmin || x.canWrite).map((x) => (
                      <option key={x.id} value={x.id}>{x.name}</option>
                    ))}
                    {isAdmin && <option value="">— Unassigned —</option>}
                  </select>
                )}

                {canWrite && (
                  <button
                    onClick={() => onRemove(p)}
                    disabled={busyId === p.id}
                    title="Quitar de los Top Picks"
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      width: 26, height: 26, flexShrink: 0, borderRadius: 7,
                      background: "rgba(248,72,94,0.05)", border: "1px solid rgba(248,72,94,0.20)",
                      color: PATRIA.pink, cursor: "pointer",
                    }}
                  >
                    {busyId === p.id
                      ? <Loader2 size={11} style={{ animation: "spin 0.8s linear infinite" }} />
                      : <Trash2 size={11} />}
                  </button>
                )}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ── Precio objetivo editable ─────────────────────────────────────────────────
// Componente propio porque necesita estado local: el input muestra el número crudo
// mientras se edita y vuelve a formatearse con separadores de miles al salir.
function TargetPriceInput({
  pick, disabled, onSave,
}: {
  pick:     TopPickDTO;
  disabled: boolean;
  onSave:   (value: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState("");

  const shown = pick.targetPrice != null
    ? pick.targetPrice.toLocaleString("en-US", { maximumFractionDigits: 0 })
    : "—";

  function commit() {
    setEditing(false);
    const raw = draft.trim();
    // Campo vacío = borrar el precio (NULL), no cero. Un 0 es un precio objetivo
    // de cero, que casi siempre es un error de carga.
    const next = raw === "" ? null : Number(raw);
    if (next !== null && !Number.isFinite(next)) return;
    if (next !== pick.targetPrice) onSave(next);
  }

  if (!editing) {
    return (
      <button
        onClick={() => { setDraft(pick.targetPrice != null ? String(pick.targetPrice) : ""); setEditing(true); }}
        disabled={disabled}
        title="Editar precio objetivo"
        style={{
          flexShrink: 0, minWidth: 52, padding: "3px 7px", borderRadius: 6,
          background: "transparent", border: "1px solid transparent",
          fontSize: 11, fontWeight: 800, textAlign: "right", cursor: "pointer",
          fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums",
          color: pick.targetPrice == null
            ? TEXT.disabled
            : pick.isLegacy ? "rgba(13,13,56,0.38)" : PATRIA.blue,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = BORDER.base; e.currentTarget.style.background = "#F5F7FD"; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "transparent"; e.currentTarget.style.background = "transparent"; }}
      >
        {shown}
      </button>
    );
  }

  return (
    <input
      autoFocus
      value={draft}
      inputMode="decimal"
      onChange={(e) => setDraft(e.target.value.replace(/[^\d.]/g, ""))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter")  (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setEditing(false);
      }}
      placeholder="—"
      style={{
        flexShrink: 0, width: 76, padding: "3px 7px", borderRadius: 6,
        border: `1px solid ${PATRIA.kingBlue}`, background: "#FFFFFF",
        fontSize: 11, fontWeight: 800, textAlign: "right", outline: "none",
        fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums",
        color: PATRIA.darkBlue,
      }}
    />
  );
}

const thBase: React.CSSProperties = {
  padding: "9px 14px",
  background: "#F5F7FD",
  borderBottom: `2px solid ${BORDER.base}`,
  fontSize: 9.5, fontWeight: 800, letterSpacing: "0.08em",
  color: TEXT.muted, textTransform: "uppercase", whiteSpace: "nowrap",
};

const ghostBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 5,
  fontSize: 11.5, fontWeight: 700, padding: "6px 13px", borderRadius: 8,
  background: "#FFFFFF", color: PATRIA.blue,
  border: `1px solid ${BORDER.base}`, cursor: "pointer", whiteSpace: "nowrap",
};
