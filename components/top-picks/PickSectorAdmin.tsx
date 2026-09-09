"use client";

import { useEffect, useState } from "react";
import { X, Plus, Trash2, Loader2, Check, Copy, Users, RotateCcw, ArrowLeftRight, ChevronUp, ChevronDown } from "lucide-react";
import { FONT_SECONDARY, TEXT, BORDER, PATRIA } from "@/lib/patriaTheme";
import type { PickSectorDTO } from "@/lib/topPicks";
import type { AnalystOption } from "@/app/api/planning/analysts/route";

// Administración de los sectores de Top Picks. Sólo admin.
//
// La membresía no es decorativa: además de decidir quién puede agregar picks, es lo
// que determina el estado legacy. Sacar a un analista de acá pinta sus picks en gris
// al instante, sin tocar la tabla de picks.

interface Props {
  /** Los sectores son propios de cada región: lo que se cree o borre acá no toca la otra. */
  region:   "CHILE" | "LATAM";
  sectors:  PickSectorDTO[];
  onClose:  () => void;
  onChanged: () => void;
}

export default function PickSectorAdmin({ region, sectors, onClose, onChanged }: Props) {
  const [analysts, setAnalysts] = useState<AnalystOption[]>([]);
  const [busy, setBusy]         = useState<string | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [notice, setNotice]     = useState<string | null>(null);
  const [newName, setNewName]   = useState("");

  useEffect(() => {
    fetch("/api/planning/analysts")
      .then((r) => (r.ok ? r.json() : { analysts: [] }))
      .then((d) => setAnalysts(d.analysts ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function call(url: string, init: RequestInit, key: string): Promise<boolean> {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(url, init);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Falló la operación");
      onChanged();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falló la operación");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function createSector() {
    const name = newName.trim();
    if (!name) return;
    const ok = await call("/api/pick-sectors", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ region, name }),
    }, "new");
    if (ok) setNewName("");
  }

  // Renombrar. Es la pieza que faltaba: la migración creó los sectores con el nombre
  // que traía industry_group —en Chile, el nombre del analista— y de acá en adelante
  // el equipo los rebautiza por cobertura ("Retail", "Financials") sin perder los
  // picks que ya cuelgan de ellos.
  async function renameSector(sector: PickSectorDTO, raw: string) {
    const name = raw.trim();
    if (!name || name === sector.name) return;
    await call(`/api/pick-sectors/${sector.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }, sector.id);
  }

  async function toggleMember(sector: PickSectorDTO, userId: string) {
    const ids = sector.members.map((m) => m.id);
    const next = ids.includes(userId) ? ids.filter((x) => x !== userId) : [...ids, userId];
    await call(`/api/pick-sectors/${sector.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberIds: next }),
    }, sector.id);
  }

  /** Devuelve al sector a alguien que dejó picks acá: sus picks vuelven a activo. */
  async function reinstate(sector: PickSectorDTO, userId: string) {
    const next = [...new Set([...sector.members.map((m) => m.id), userId])];
    await call(`/api/pick-sectors/${sector.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberIds: next }),
    }, sector.id);
  }

  /**
   * Traspaso de sector a otro analista, en una sola acción.
   *
   * Reemplaza TODOS los miembros por el nuevo. Como el estado legacy se deriva de la
   * membresía, con eso solo los picks de quien salía pasan a gris automáticamente —
   * no hay nada que marcar pick por pick. El confirm dice cuántos van a cambiar para
   * que no sea una sorpresa.
   */
  async function handover(sector: PickSectorDTO, userId: string) {
    const nuevo   = analysts.find((a) => a.id === userId);
    const salen   = sector.members.filter((m) => m.id !== userId);
    const enGris  = sector.former.reduce((n, f) => n + f.picks, 0);
    if (salen.length === 0 && sector.members.some((m) => m.id === userId)) return;

    const detalle = salen.length
      ? `Sale: ${salen.map((m) => m.initials ?? m.name).join(", ")}.
`
      : "";
    if (!confirm(
      `Traspasar "${sector.name}" a ${nuevo?.name ?? "el analista"}?

` +
      detalle +
      `Todos los picks anteriores del sector quedan en gris; los nuevos que cargue ` +
      `${nuevo?.initials ?? "el analista"} entran activos.` +
      (enGris ? `

Ya hay ${enGris} pick(s) en gris de analistas previos: siguen igual.` : "")
    )) return;

    await call(`/api/pick-sectors/${sector.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberIds: [userId] }),
    }, sector.id);
  }

  /**
   * Sube o baja un sector. Manda la lista completa reordenada en vez de intercambiar
   * dos posiciones: así dos clicks seguidos no se pisan y el orden nunca queda con
   * números repetidos.
   */
  async function move(index: number, dir: -1 | 1) {
    const next = [...sectors];
    const to = index + dir;
    if (to < 0 || to >= next.length) return;
    [next[index], next[to]] = [next[to], next[index]];
    await call("/api/pick-sectors/reorder", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ region, sectorIds: next.map((x) => x.id) }),
    }, "reorder");
  }

  async function removeSector(sector: PickSectorDTO) {
    if (!confirm(`¿Eliminar el sector "${sector.name}"?\n\nLos picks que tenga NO se borran: vuelven al grupo "Unassigned".`)) return;
    await call(`/api/pick-sectors/${sector.id}`, { method: "DELETE" }, sector.id);
  }

  async function copyFromPlanning() {
    setBusy("copy");
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/pick-sectors/copy-from-planning", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ region }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "No se pudo copiar");
      setNotice(
        d.created > 0
          ? `${d.created} sector(es) copiados: ${(d.sectors ?? []).join(", ")}`
          : d.message ?? "No había nada nuevo que copiar.",
      );
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo copiar");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Manage pick sectors"
      style={{
        position: "fixed", inset: 0, zIndex: 150,
        background: "rgba(13,13,56,0.45)", backdropFilter: "blur(3px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#FFFFFF", borderRadius: 14, width: "min(620px, 100%)",
          maxHeight: "88vh", display: "flex", flexDirection: "column",
          boxShadow: "0 24px 70px rgba(13,13,56,0.30)", border: `1px solid ${BORDER.base}`,
          overflow: "hidden",
        }}
      >
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "14px 18px", borderBottom: `1px solid ${BORDER.subtle}`, background: "#F5F7FD",
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: PATRIA.darkBlue, letterSpacing: "-0.015em" }}>
              Sectores de Top Picks · {region}
            </div>
            <div style={{ fontSize: 11, color: TEXT.muted, marginTop: 1 }}>
              Renombra el sector y asigna sus analistas — los miembros deciden quién
              escribe y qué picks quedan legacy
            </div>
          </div>
          <button onClick={onClose} aria-label="Close"
            style={{ background: "transparent", border: "none", cursor: "pointer", color: TEXT.label, padding: 3, display: "flex" }}>
            <X size={17} />
          </button>
        </div>

        <div style={{ padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
          {sectors.length === 0 && (
            <div style={{
              padding: "16px 14px", borderRadius: 10, background: "#F5F7FD",
              border: `1px solid ${BORDER.subtle}`, textAlign: "center",
            }}>
              <p style={{ fontSize: 12.5, color: TEXT.label, margin: "0 0 10px" }}>
                Todavía no hay sectores. Puedes copiar los que ya definiste en Team Planning.
              </p>
              <button
                onClick={copyFromPlanning}
                disabled={busy === "copy"}
                style={primaryBtn}
              >
                {busy === "copy"
                  ? <Loader2 size={13} style={{ animation: "spin 0.8s linear infinite" }} />
                  : <Copy size={13} />}
                Copiar sectores desde Team Planning
              </button>
            </div>
          )}

          {sectors.map((s, idx) => (
            <div key={s.id} style={{
              border: `1px solid ${BORDER.base}`, borderRadius: 10, padding: "11px 13px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
                {/* Orden. Flechas y no drag & drop: son 14 sectores en una lista con
                    scroll, y arrastrar dentro de un modal que ya scrollea es peor. */}
                <span style={{ display: "flex", flexDirection: "column", flexShrink: 0, gap: 1 }}>
                  <button
                    onClick={() => move(idx, -1)}
                    disabled={idx === 0 || busy === "reorder"}
                    title="Subir"
                    style={{ ...arrowBtn, opacity: idx === 0 ? 0.25 : 1, cursor: idx === 0 ? "default" : "pointer" }}
                  >
                    <ChevronUp size={11} />
                  </button>
                  <button
                    onClick={() => move(idx, 1)}
                    disabled={idx === sectors.length - 1 || busy === "reorder"}
                    title="Bajar"
                    style={{ ...arrowBtn, opacity: idx === sectors.length - 1 ? 0.25 : 1, cursor: idx === sectors.length - 1 ? "default" : "pointer" }}
                  >
                    <ChevronDown size={11} />
                  </button>
                </span>
                <input
                  defaultValue={s.name}
                  onBlur={(e) => renameSector(s, e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  maxLength={120}
                  title="Renombrar sector"
                  style={{
                    flex: 1, minWidth: 0, padding: "5px 8px", borderRadius: 7,
                    border: `1px solid transparent`, background: "transparent",
                    fontSize: 13, fontWeight: 700, color: PATRIA.darkBlue, outline: "none",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.background = "#F5F7FD";
                    e.currentTarget.style.borderColor = BORDER.base;
                  }}
                  onMouseEnter={(e) => { if (document.activeElement !== e.currentTarget) e.currentTarget.style.borderColor = BORDER.subtle; }}
                  onMouseLeave={(e) => { if (document.activeElement !== e.currentTarget) e.currentTarget.style.borderColor = "transparent"; }}
                />
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  fontSize: 10, color: TEXT.muted, fontFamily: FONT_SECONDARY,
                }}>
                  <Users size={10} />{s.members.length}
                </span>
                <button
                  onClick={() => removeSector(s)}
                  disabled={busy === s.id}
                  title="Eliminar sector"
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    width: 26, height: 26, borderRadius: 7, flexShrink: 0,
                    background: "rgba(248,72,94,0.05)", border: "1px solid rgba(248,72,94,0.20)",
                    color: PATRIA.pink, cursor: "pointer",
                  }}
                >
                  {busy === s.id
                    ? <Loader2 size={11} style={{ animation: "spin 0.8s linear infinite" }} />
                    : <Trash2 size={11} />}
                </button>
              </div>

              {/* Analistas anteriores: quién dejó picks acá y ya no es miembro. Es lo
                  que explica el gris de la tabla, en vez de que el usuario tenga que
                  deducirlo de quién NO está seleccionado abajo. */}
              {s.former.length > 0 && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap",
                  padding: "6px 9px", marginBottom: 9, borderRadius: 8,
                  background: "rgba(13,13,56,0.035)", border: `1px solid ${BORDER.subtle}`,
                }}>
                  <span style={{
                    fontSize: 9, fontWeight: 800, letterSpacing: "0.06em",
                    textTransform: "uppercase", color: TEXT.disabled,
                  }}>
                    Antes
                  </span>
                  {s.former.map((f) => (
                    <span key={f.name} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                      <span style={{ fontSize: 11, color: "rgba(13,13,56,0.42)", whiteSpace: "nowrap" }}>
                        {f.name}
                      </span>
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 4,
                        background: "rgba(13,13,56,0.06)", color: "rgba(13,13,56,0.42)",
                        border: `1px solid ${BORDER.base}`, whiteSpace: "nowrap",
                      }}>
                        {f.picks} en gris
                      </span>
                      {/* Sólo se puede reincorporar a quien sigue existiendo como usuario. */}
                      {f.userId && (
                        <button
                          onClick={() => reinstate(s, f.userId!)}
                          disabled={busy === s.id}
                          title={`Devolver ${f.name} al sector — sus picks vuelven a activo`}
                          style={{
                            display: "inline-flex", alignItems: "center", gap: 3,
                            background: "none", border: "none", cursor: "pointer",
                            fontSize: 10, fontWeight: 700, color: PATRIA.blue, padding: 0,
                          }}
                        >
                          <RotateCcw size={9} /> reactivar
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}

              <div>
                <div style={{
                  display: "flex", alignItems: "center", gap: 6, marginBottom: 5,
                  fontSize: 9, fontWeight: 800, letterSpacing: "0.06em",
                  textTransform: "uppercase", color: TEXT.disabled,
                }}>
                  Analistas
                  <span style={{ fontWeight: 600, letterSpacing: 0, textTransform: "none", fontSize: 9.5, color: TEXT.disabled }}>
                    — click para sumar o quitar · ⇄ para traspasar el sector
                  </span>
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {analysts.map((a) => {
                    const on = s.members.some((m) => m.id === a.id);
                    const sigla = a.initials ?? (a.name ?? a.email ?? "?").slice(0, 2).toUpperCase();
                    return (
                      <span key={a.id} style={{
                        display: "inline-flex", alignItems: "stretch",
                        borderRadius: 6, overflow: "hidden",
                        border: `1px solid ${on ? "rgba(32,68,220,0.38)" : BORDER.base}`,
                      }}>
                        <button
                          onClick={() => toggleMember(s, a.id)}
                          disabled={busy === s.id}
                          title={on ? `Quitar a ${a.name} del sector` : `Sumar a ${a.name} al sector`}
                          style={{
                            display: "inline-flex", alignItems: "center", gap: 4,
                            padding: "4px 9px", fontSize: 11, fontWeight: 700,
                            cursor: "pointer", fontFamily: FONT_SECONDARY, border: "none",
                            background: on ? "rgba(32,68,220,0.12)" : "#F5F7FD",
                            color:      on ? PATRIA.blue : TEXT.label,
                          }}
                        >
                          {on && <Check size={9} />}
                          {sigla}
                        </button>

                        {/* Traspaso: deja SÓLO a esta persona y manda a gris todo lo
                            anterior. Es la acción que antes había que armar a mano
                            quitando uno por uno y agregando al nuevo. */}
                        {!on && (
                          <button
                            onClick={() => handover(s, a.id)}
                            disabled={busy === s.id}
                            title={`Traspasar el sector a ${a.name} — lo anterior queda en gris`}
                            style={{
                              display: "inline-flex", alignItems: "center",
                              padding: "0 6px", border: "none", cursor: "pointer",
                              borderLeft: `1px solid ${BORDER.base}`,
                              background: "#FFFFFF", color: PATRIA.orange,
                            }}
                          >
                            <ArrowLeftRight size={10} />
                          </button>
                        )}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}

          {/* Crear sector */}
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") createSector(); }}
              placeholder={`Nuevo sector en ${region} (ej. Retail, Financials)…`}
              maxLength={120}
              style={{
                flex: 1, boxSizing: "border-box", padding: "8px 11px", borderRadius: 9,
                border: `1px solid ${BORDER.base}`, background: "#F5F7FD",
                color: PATRIA.darkBlue, fontSize: 12.5, outline: "none",
              }}
            />
            <button
              onClick={createSector}
              disabled={!newName.trim() || busy === "new"}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 34, height: 34, flexShrink: 0, borderRadius: 8,
                background: newName.trim() ? PATRIA.blue : "#F5F7FD",
                color: newName.trim() ? "#FFFFFF" : TEXT.disabled,
                border: `1px solid ${newName.trim() ? PATRIA.blue : BORDER.base}`,
                cursor: newName.trim() ? "pointer" : "default",
              }}
            >
              {busy === "new"
                ? <Loader2 size={13} style={{ animation: "spin 0.8s linear infinite" }} />
                : <Plus size={14} />}
            </button>
          </div>

          {sectors.length > 0 && (
            <button onClick={copyFromPlanning} disabled={busy === "copy"} style={{ ...primaryBtn, alignSelf: "flex-start", background: "#FFFFFF", color: PATRIA.blue, border: `1px solid ${BORDER.base}` }}>
              {busy === "copy"
                ? <Loader2 size={13} style={{ animation: "spin 0.8s linear infinite" }} />
                : <Copy size={13} />}
              Copiar sectores desde Team Planning
            </button>
          )}

          {notice && (
            <div style={{ fontSize: 12, color: "#001EAF", background: "rgba(32,68,220,0.07)", border: "1px solid rgba(32,68,220,0.22)", borderRadius: 8, padding: "8px 11px" }}>
              {notice}
            </div>
          )}
          {error && (
            <div style={{ fontSize: 12, color: "#B01029", background: "rgba(248,72,94,0.08)", border: "1px solid rgba(248,72,94,0.24)", borderRadius: 8, padding: "8px 11px" }}>
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const arrowBtn: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center",
  width: 20, height: 14, borderRadius: 4, padding: 0,
  background: "#F5F7FD", border: "1px solid rgba(13,13,56,0.10)",
  color: "rgba(13,13,56,0.55)",
};

const primaryBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6,
  padding: "7px 15px", borderRadius: 8, fontSize: 12, fontWeight: 700,
  background: PATRIA.blue, color: "#FFFFFF", border: "none", cursor: "pointer",
};
