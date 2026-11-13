"use client";

import { useEffect, useState } from "react";
import { X, Loader2, ArrowRight, Pencil } from "lucide-react";
import { FONT_SECONDARY, TEXT, BORDER, PATRIA } from "@/lib/patriaTheme";
import { tickerPath } from "@/lib/issuer";
import {
  RECC_OPTIONS, normRecc, reccChanged, reccDirection, thesisChanged, tpChanged, todayIsoSantiago,
} from "@/lib/reccChange";

// Revisión manual de la última versión del modelo: el analista cambia recomendación, TP
// o tesis sin rehacer la planilla. El servidor crea una versión con fecha de hoy que
// copia las estimaciones (o edita la de hoy si ya existe) y avisa por Telegram.

interface Props {
  kind:    "company" | "bank";
  ticker:  string;
  current: { updateDate: string; recc: string | null; tp: number | null; thesis: string | null };
  onClose: () => void;
  onSaved: (updateDate: string) => void;
}

function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

function fmtTp(v: number | null) {
  return v == null ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: Math.abs(v) < 100 ? 2 : 0 });
}

export default function ReviseModelModal({ kind, ticker, current, onClose, onSaved }: Props) {
  const curRecc = normRecc(current.recc);
  const [recc, setRecc]     = useState<string | null>(curRecc);
  const [tp, setTp]         = useState(current.tp != null ? String(current.tp) : "");
  const [thesis, setThesis] = useState(current.thesis ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape" && !saving) onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const today   = todayIsoSantiago();
  const sameDay = current.updateDate >= today;
  const tpNum   = tp.trim() ? Number(tp) : null;
  const tpValid = tpNum === null || (isFinite(tpNum) && tpNum > 0);

  const reccMoved   = reccChanged(curRecc, recc);
  const tpMoved     = tpValid && tpChanged(current.tp, tpNum);
  const thesisMoved = thesisChanged(current.thesis, thesis);
  const dirty       = reccMoved || tpMoved || thesisMoved;
  const direction   = reccMoved ? reccDirection(curRecc, recc) : null;

  // Una recomendación fuera de BUY/HOLD/SELL (p. ej. "OW" de una planilla vieja) se
  // conserva como opción para no forzar el cambio.
  const options = curRecc && !(RECC_OPTIONS as readonly string[]).includes(curRecc)
    ? [...RECC_OPTIONS, curRecc] : [...RECC_OPTIONS];

  async function save() {
    if (!dirty || !tpValid) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/companies/${tickerPath(ticker)}/${kind === "bank" ? "bank-model" : "model"}`,
        {
          method:  "PATCH",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ recc, tp: tpNum, thesis }),
        },
      );
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      onSaved(d.updateDate);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
      setSaving(false);
    }
  }

  return (
    <div
      onClick={() => !saving && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="Revise recommendation"
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
          background: "#FFFFFF", borderRadius: 14, width: "min(520px, 100%)",
          maxHeight: "88dvh", display: "flex", flexDirection: "column",
          boxShadow: "0 24px 70px rgba(13,13,56,0.30)", border: `1px solid ${BORDER.base}`,
          overflow: "hidden",
        }}
      >
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "14px 18px", borderBottom: `1px solid ${BORDER.subtle}`, background: "#F5F7FD",
        }}>
          <span style={{ flex: 1, fontSize: 14, fontWeight: 800, color: PATRIA.darkBlue, letterSpacing: "-0.015em" }}>
            Revise view · <span style={{ fontFamily: FONT_SECONDARY }}>{ticker.replace(/ EQUITY$/i, "")}</span>
          </span>
          <button onClick={onClose} disabled={saving} aria-label="Close"
            style={{ background: "transparent", border: "none", cursor: "pointer", color: TEXT.label, padding: 3, display: "flex" }}>
            <X size={17} />
          </button>
        </div>

        <div style={{ padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
          {/* ── Recomendación ──────────────────────────────────────────────────── */}
          <div>
            <label style={labelStyle}>Recommendation</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {options.map((o) => {
                const active = recc === o;
                const tone   = o.includes("BUY") ? PATRIA.kingBlue : o.includes("SELL") ? PATRIA.pink : PATRIA.darkBlue;
                return (
                  <button
                    key={o}
                    type="button"
                    onClick={() => setRecc(o)}
                    aria-pressed={active}
                    style={{
                      minWidth: 74, height: 34, padding: "0 14px", borderRadius: 8,
                      fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", cursor: "pointer",
                      background: active ? tone : "#FFFFFF",
                      color:      active ? "#FFFFFF" : tone,
                      border:     `1px solid ${active ? tone : BORDER.base}`,
                    }}
                  >
                    {o}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── TP ─────────────────────────────────────────────────────────────── */}
          <div>
            <label style={labelStyle}>Target price</label>
            <input
              value={tp}
              onChange={(e) => setTp(e.target.value.replace(/[^\d.]/g, ""))}
              inputMode="decimal"
              placeholder="—"
              style={{ ...inputStyle, fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums" }}
            />
            {!tpValid && <p style={{ fontSize: 11, color: "#B01029", margin: "5px 0 0" }}>Target price inválido.</p>}
          </div>

          {/* ── Tesis ──────────────────────────────────────────────────────────── */}
          <div>
            <label style={labelStyle}>Thesis</label>
            <textarea
              value={thesis}
              onChange={(e) => setThesis(e.target.value)}
              rows={5}
              placeholder="Why the view changed"
              style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
            />
          </div>

          {/* ── Resumen del cambio ─────────────────────────────────────────────── */}
          {dirty && (
            <div style={{
              display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: TEXT.body,
              background: "rgba(32,68,220,0.05)", border: "1px solid rgba(32,68,220,0.18)",
              borderRadius: 9, padding: "9px 12px",
            }}>
              {reccMoved && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <b>{curRecc ?? "—"}</b> <ArrowRight size={12} /> <b>{recc ?? "—"}</b>
                  {direction && (
                    <span style={{ fontWeight: 700, color: direction === "upgrade" ? PATRIA.kingBlue : PATRIA.pink }}>
                      · {direction === "upgrade" ? "Upgrade" : "Downgrade"}
                    </span>
                  )}
                </span>
              )}
              {tpMoved && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums" }}>
                  TP <b>{fmtTp(current.tp)}</b> <ArrowRight size={12} /> <b>{fmtTp(tpNum)}</b>
                  {current.tp && tpNum ? ` (${tpNum / current.tp - 1 >= 0 ? "+" : ""}${((tpNum / current.tp - 1) * 100).toFixed(1)}%)` : ""}
                </span>
              )}
              {thesisMoved && <span>Thesis updated</span>}
            </div>
          )}

          <p style={{ fontSize: 11, color: TEXT.muted, margin: 0, lineHeight: 1.5 }}>
            {sameDay
              ? <>Se edita la versión de hoy ({fmtDate(current.updateDate)}).</>
              : <>Se crea la versión del {fmtDate(today)} con las mismas estimaciones del modelo del {fmtDate(current.updateDate)}.</>}
            {" "}Se avisa en Telegram (Model updates).
          </p>

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
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || !dirty || !tpValid}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "7px 18px", borderRadius: 8, fontSize: 12.5, fontWeight: 700,
              background: dirty && tpValid ? PATRIA.blue : "rgba(13,13,56,0.20)",
              color: "#FFFFFF", border: "none",
              cursor: dirty && tpValid && !saving ? "pointer" : "default",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving && <Loader2 size={13} style={{ animation: "spin 0.8s linear infinite" }} />}
            Save & notify
          </button>
        </div>
      </div>
    </div>
  );
}

/** Botón que abre el modal, bajo la tabla de info del modelo. */
export function ReviseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 6,
        height: 30, padding: "0 12px", borderRadius: 6, fontSize: 11.5, fontWeight: 700,
        background: PATRIA.white, color: PATRIA.kingBlue,
        border: "1px solid rgba(32,68,220,0.30)", cursor: "pointer", outline: "none",
      }}
    >
      <Pencil size={12} /> Change recommendation / TP / thesis
    </button>
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
