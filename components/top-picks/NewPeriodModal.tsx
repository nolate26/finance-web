"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Loader2, CalendarPlus } from "lucide-react";
import { FONT_SECONDARY, TEXT, BORDER, PATRIA } from "@/lib/patriaTheme";
import { currentPeriod, nextPeriod, normalizePeriod, periodLabel } from "@/lib/topPicks";

// Abrir el período siguiente. Sólo admin.
//
// Antes el único período disponible era el del calendario, así que el trimestre que
// viene no existía hasta que llegaba la fecha: se podía editar lo ya cargado pero no
// empezar el siguiente. Acá se declara el período —queda visible aunque esté vacío— y
// se le fija de una vez la fecha del informe.

interface Props {
  region:   "CHILE" | "LATAM";
  isChile:  boolean;
  /** Períodos que ya existen (con picks o abiertos): se ofrecen los que vienen después. */
  existing: string[];
  onClose:   () => void;
  /** Recibe el período creado para saltar directo a cargarlo. */
  onCreated: (period: string) => void;
}

/** Hoy en local, en el formato que espera <input type="date">. */
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function NewPeriodModal({ region, isChile, existing, onClose, onCreated }: Props) {
  // TODO período que falta, no sólo los que vienen después del último cargado.
  //
  // Ofrecer únicamente hacia adelante dejaba fuera dos casos reales: los HUECOS —en
  // Chile están Q1 y Q3 2026 pero no Q2— y el período en curso, que la grilla siempre
  // muestra para poder cargarlo pero que hasta no tener picks no existe de verdad. Así
  // que se recorre desde el más antiguo conocido hasta unos pasos más allá de hoy, y se
  // descarta lo que ya existe.
  //
  // La comparación es de texto: "YYYY-MM" ordena igual alfabética que cronológicamente.
  const { list: candidates, preferred, anchor } = useMemo(() => {
    const sorted = [...existing].sort();
    const now    = normalizePeriod(currentPeriod(isChile), isChile);
    // Los quarters históricos de Chile guardan el mes del informe (2025-12 es Q4 2025):
    // sin normalizar, Q4 2025 no se reconocería como ocupado y se ofrecería de nuevo.
    const taken  = new Set(sorted.map((p) => normalizePeriod(p, isChile)));

    const anchor = normalizePeriod(sorted[sorted.length - 1] ?? now, isChile);
    const first  = normalizePeriod(sorted[0] ?? now, isChile);

    let end = anchor > now ? anchor : now;
    for (let i = 0; i < (isChile ? 4 : 6); i++) end = nextPeriod(end, isChile);

    const list: string[] = [];
    let cursor = first;
    // El tope de vueltas es un cinturón contra un `existing` corrupto que hiciera
    // que el cursor nunca alcance el fin.
    for (let guard = 0; cursor <= end && guard < 300; guard++) {
      if (!taken.has(cursor)) list.push(cursor);
      cursor = nextPeriod(cursor, isChile);
    }

    // El que sigue al último cargado es el que se quiere casi siempre; los huecos
    // están para cuando no. Se muestran del más nuevo al más viejo, como la grilla.
    const natural   = nextPeriod(anchor, isChile);
    const preferred = list.includes(natural) ? natural : list[list.length - 1] ?? "";
    list.reverse();
    return { list, preferred, anchor };
  }, [existing, isChile]);

  const [period, setPeriod]   = useState(preferred);
  const [date, setDate]       = useState(todayIso);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save() {
    if (!period) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/top-picks/periods", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ region, period, reportDate: date || null }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "No se pudo abrir el período");
      onCreated(period);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo abrir el período");
      setSaving(false);
    }
  }

  const unidad = isChile ? "quarter" : "período";

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Abrir ${unidad}`}
      className="modal-overlay"
      style={{
        position: "fixed", inset: 0, zIndex: 150,
        background: "rgba(13,13,56,0.45)", backdropFilter: "blur(3px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="modal-card"
        style={{
          background: "#FFFFFF", borderRadius: 14, width: "min(440px, 100%)",
          overflowY: "auto",
          display: "flex", flexDirection: "column",
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
              Abrir {unidad} · {region}
            </div>
            <div style={{ fontSize: 11, color: TEXT.muted, marginTop: 1 }}>
              Queda disponible para cargar picks aunque todavía esté vacío
            </div>
          </div>
          <button onClick={onClose} aria-label="Close"
            style={{ background: "transparent", border: "none", cursor: "pointer", color: TEXT.label, padding: 3, display: "flex" }}>
            <X size={17} />
          </button>
        </div>

        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={labelStyle}>{isChile ? "Quarter" : "Período"}</label>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              style={{ ...inputStyle, cursor: "pointer" }}
            >
              {candidates.map((p) => (
                <option key={p} value={p}>
                  {periodLabel(p, isChile)}
                  {/* Un período anterior al último cargado es un hueco de la serie,
                      no la continuación: conviene que se note antes de elegirlo. */}
                  {p < anchor ? " · hueco" : ""}
                </option>
              ))}
            </select>
            {period && period < anchor && (
              <p style={{ fontSize: 10.5, color: PATRIA.orange, margin: "5px 0 0" }}>
                Queda entre períodos que ya existen, no al final de la serie.
              </p>
            )}
          </div>

          <div>
            <label style={labelStyle}>Fecha del informe</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{ ...inputStyle, fontFamily: FONT_SECONDARY }}
            />
            <p style={{ fontSize: 10.5, color: TEXT.muted, margin: "5px 0 0" }}>
              Se muestra al lado del {isChile ? "quarter" : "período"} en la grilla. Se puede cambiar después.
            </p>
          </div>

          {error && (
            <div style={{
              fontSize: 12, color: "#B01029", background: "rgba(248,72,94,0.08)",
              border: "1px solid rgba(248,72,94,0.24)", borderRadius: 8, padding: "8px 11px",
            }}>
              {error}
            </div>
          )}
        </div>

        <div style={{
          display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8,
          padding: "11px 18px", borderTop: `1px solid ${BORDER.subtle}`, background: "#F5F7FD",
        }}>
          <button onClick={onClose} disabled={saving}
            style={{ padding: "7px 16px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, background: "#FFFFFF", color: TEXT.label, border: `1px solid ${BORDER.base}`, cursor: "pointer" }}>
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={saving || !period}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "7px 18px", borderRadius: 8, fontSize: 12.5, fontWeight: 700,
              background: period ? PATRIA.blue : "rgba(13,13,56,0.20)",
              color: "#FFFFFF", border: "none",
              cursor: period && !saving ? "pointer" : "default",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving
              ? <Loader2 size={13} style={{ animation: "spin 0.8s linear infinite" }} />
              : <CalendarPlus size={13} />}
            Abrir
          </button>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "8px 11px", borderRadius: 9,
  border: "1px solid rgba(13,13,56,0.10)", background: "#F5F7FD",
  color: PATRIA.darkBlue, fontSize: 13, outline: "none", fontFamily: FONT_SECONDARY,
};

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 10, fontWeight: 700, letterSpacing: "0.07em",
  textTransform: "uppercase", color: TEXT.muted, marginBottom: 6,
};
