"use client";

import { useState } from "react";
import { X, AlertCircle, Check, ExternalLink, Loader2, Trash2 } from "lucide-react";
import CaseTickersEditor, { type CaseTicker } from "@/components/presentations/CaseTickersEditor";
import type { Presentation } from "@/lib/presentationDto";
import { FONT_SECONDARY, TEXT, BORDER, PATRIA } from "@/lib/patriaTheme";

/**
 * Revisión de un investment case (sólo admin).
 *
 * Es el paso final del flujo: el caso lo subió cualquiera del equipo y quedó
 * "pending". Acá el admin corrige lo que haga falta y lo aprueba. Guardar y aprobar
 * son dos botones distintos a propósito — se puede corregir hoy y aprobar después de
 * hablar con quien lo subió.
 */

const INPUT: React.CSSProperties = {
  width: "100%", padding: "8px 11px",
  border: `1px solid ${BORDER.strong}`, borderRadius: 7,
  fontSize: 13, color: TEXT.body, background: "#F5F7FD",
  outline: "none", fontFamily: FONT_SECONDARY, boxSizing: "border-box",
};

const LABEL: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: TEXT.label,
  textTransform: "uppercase", letterSpacing: "0.07em",
  marginBottom: 5, display: "block",
};

export default function ReviewCaseModal({
  presentation, onSaved, onDelete, onClose,
}: {
  presentation: Presentation;
  onSaved: (p: Presentation) => void;
  /** Rechazar el caso: lo borra junto con su archivo. La confirmación la hace el padre. */
  onDelete: (p: Presentation) => void;
  onClose: () => void;
}) {
  const [title,   setTitle]   = useState(presentation.title);
  const [desc,    setDesc]    = useState(presentation.description ?? "");
  const [region,  setRegion]  = useState(presentation.region);
  const [date,    setDate]    = useState(presentation.case_date ?? "");
  const [tickers, setTickers] = useState<CaseTicker[]>(
    presentation.tickers.map((t) => ({
      ticker: t.ticker, company_name: t.company_name,
      target_price: t.target_price, recommendation: t.recommendation,
    })),
  );

  const [busy,  setBusy]  = useState<"save" | "approve" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isPending = presentation.review_status === "pending";

  async function submit(approve: boolean) {
    if (tickers.length === 0) { setError("El caso necesita al menos una empresa."); return; }
    if (!title.trim())        { setError("El título no puede quedar vacío.");       return; }

    setBusy(approve ? "approve" : "save");
    setError(null);
    try {
      const res = await fetch(`/api/presentations/${encodeURIComponent(presentation.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: desc.trim() || null,
          region,
          case_date: date || null,
          tickers: tickers.map((t) => ({
            ticker: t.ticker, target_price: t.target_price, recommendation: t.recommendation,
          })),
          ...(approve ? { approve: true } : {}),
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      onSaved(d.presentation as Presentation);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
      setBusy(null);
    }
  }

  return (
    <div
      className="modal-overlay"
      style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(13,13,56,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(2px)" }}
      onClick={(e) => { if (!busy && e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal-card" style={{ background: "#fff", borderRadius: 14, boxShadow: "0 20px 60px rgba(13,13,56,0.22)", width: "100%", maxWidth: 620, maxHeight: "calc(100dvh - 40px)", overflowY: "auto" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px 16px", borderBottom: `1px solid ${BORDER.subtle}`, position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: TEXT.body, margin: 0 }}>
              {isPending ? "Review investment case" : "Edit investment case"}
            </p>
            <p style={{ fontSize: 11, color: TEXT.muted, margin: "3px 0 0", fontFamily: FONT_SECONDARY }}>
              {presentation.uploaded_by ? `Subido por ${presentation.uploaded_by}` : "Origen desconocido"}
              {" · "}
              {new Date(presentation.created_at).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" })}
            </p>
          </div>
          <button onClick={onClose} disabled={!!busy} style={{ background: "none", border: "none", cursor: busy ? "not-allowed" : "pointer", color: TEXT.muted, padding: 4, borderRadius: 6 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: "18px 22px 22px", display: "flex", flexDirection: "column", gap: 15 }}>

          {/* Aviso + acceso al PDF: revisar sin abrir el archivo no sirve de nada */}
          {isPending && (
            <div style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: "10px 13px", borderRadius: 8, background: "rgba(255,107,6,0.06)", border: "1px solid rgba(255,107,6,0.24)" }}>
              <AlertCircle size={14} color="#FF6B06" style={{ flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 11.5, color: "#C25205", margin: 0, lineHeight: 1.5 }}>
                Verificá que las empresas, el target price y la recomendación coincidan con el documento antes de aprobar.
              </p>
            </div>
          )}

          <a
            href={presentation.file_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, alignSelf: "flex-start", fontSize: 12, fontWeight: 600, color: PATRIA.kingBlue, background: "rgba(32,68,220,0.07)", border: "1px solid rgba(32,68,220,0.20)", borderRadius: 7, padding: "6px 13px", textDecoration: "none" }}
          >
            <ExternalLink size={12} /> Abrir el documento
          </a>

          <div>
            <label style={LABEL}>Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} disabled={!!busy} style={{ ...INPUT, opacity: busy ? 0.6 : 1 }} />
          </div>

          <div>
            <label style={LABEL}>Description</label>
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} disabled={!!busy} style={{ ...INPUT, resize: "vertical", lineHeight: 1.6, opacity: busy ? 0.6 : 1 }} />
          </div>

          <div className="g-stack-sm" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={LABEL}>Region</label>
              <div style={{ display: "flex", gap: 6 }}>
                {[{ label: "Chile", value: "chile" }, { label: "LatAm", value: "latam" }].map((opt) => {
                  const active = region === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      disabled={!!busy}
                      onClick={() => setRegion(opt.value)}
                      style={{
                        flex: 1, padding: "7px 8px", borderRadius: 7,
                        border: `1px solid ${active ? PATRIA.kingBlue : BORDER.strong}`,
                        background: active ? "rgba(32,68,220,0.10)" : "#F5F7FD",
                        color: active ? PATRIA.blue : TEXT.label,
                        fontSize: 12, fontWeight: 700, cursor: busy ? "not-allowed" : "pointer",
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label style={LABEL}>Case date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={!!busy} style={{ ...INPUT, opacity: busy ? 0.6 : 1 }} />
            </div>
          </div>

          <div>
            <label style={LABEL}>Companies covered <span style={{ color: PATRIA.pink }}>*</span></label>
            <CaseTickersEditor value={tickers} onChange={setTickers} disabled={!!busy} />
          </div>

          {error && (
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "10px 12px", background: "rgba(248,72,94,0.05)", border: "1px solid rgba(248,72,94,0.18)", borderRadius: 8 }}>
              <AlertCircle size={14} color={PATRIA.pink} style={{ flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 12, color: PATRIA.pink, margin: 0, lineHeight: 1.5 }}>{error}</p>
            </div>
          )}

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", paddingTop: 2 }}>
            {/* Rechazar: el caso no sirve y se va con su archivo. A la izquierda y en
                rojo, lejos de los botones de guardar, para que no se toque de paso. */}
            <button
              type="button"
              onClick={() => onDelete(presentation)}
              disabled={!!busy}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: "1px solid rgba(248,72,94,0.30)", background: "#fff", color: PATRIA.pink, fontSize: 13, fontWeight: 600, cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.5 : 1 }}
            >
              <Trash2 size={13} /> {isPending ? "Rechazar y eliminar" : "Eliminar"}
            </button>

            <span style={{ flex: 1 }} />

            <button type="button" onClick={onClose} disabled={!!busy} style={{ padding: "8px 18px", borderRadius: 8, border: `1px solid ${BORDER.strong}`, background: "#fff", color: TEXT.label, fontSize: 13, fontWeight: 600, cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.5 : 1 }}>
              Cancelar
            </button>
            <button type="button" onClick={() => submit(false)} disabled={!!busy} style={{ padding: "8px 18px", borderRadius: 8, border: `1px solid ${PATRIA.kingBlue}`, background: "#fff", color: PATRIA.blue, fontSize: 13, fontWeight: 700, cursor: busy ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
              {busy === "save" && <Loader2 size={13} style={{ animation: "spin 0.8s linear infinite" }} />}
              Guardar cambios
            </button>
            {isPending && (
              <button type="button" onClick={() => submit(true)} disabled={!!busy} style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: PATRIA.kingBlue, color: "#fff", fontSize: 13, fontWeight: 700, cursor: busy ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
                {busy === "approve" ? <Loader2 size={13} style={{ animation: "spin 0.8s linear infinite" }} /> : <Check size={14} />}
                Guardar y aprobar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
