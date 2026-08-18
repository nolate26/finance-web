"use client";

import { useState, useMemo, useEffect } from "react";
import type { TrackRecordOptions } from "@/app/api/analysis/track-record/options/route";
import { PATRIA, FONT_SECONDARY, TEXT } from "@/lib/patriaTheme";

// Fila editable (subconjunto de PreviewRow) para reutilizar el modal en modo edición.
export interface EditRecommendationRow {
  id:             number;
  date:           string;
  type:           string;
  analyst:        string;
  company:        string;
  recommendation: string;
  currentPrice:   number;
  targetPrice:    number;
}

// ── Design tokens (match the feature) ───────────────────────────────────────────
const TEXT1  = PATRIA.darkBlue;   // Regla 4
const TEXT2  = TEXT.label;
const TEXT3  = TEXT.muted;
const BORDER = "rgba(13,13,56,0.08)";
const RED    = PATRIA.pink;       // negativo
const GREEN  = PATRIA.blue;       // positivo

const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box",
  padding: "7px 10px", borderRadius: 7, border: `1px solid ${BORDER}`,
  background: "#F5F7FD", fontSize: 12.5, color: TEXT1, outline: "none",
};

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ fontSize: 10, fontWeight: 700, fontFamily: FONT_SECONDARY, color: PATRIA.kingBlue, letterSpacing: "0.06em", textTransform: "uppercase" }}>
        {label}
      </span>
      {children}
      {hint && <span style={{ fontSize: 10, color: TEXT3 }}>{hint}</span>}
    </div>
  );
}

const today = () => new Date().toISOString().slice(0, 10);

export default function AddRecommendationModal({
  open, options, onClose, onSaved, editRow = null,
}: {
  open:    boolean;
  options: TrackRecordOptions | null;
  onClose: () => void;
  onSaved: (company: string) => void;
  editRow?: EditRecommendationRow | null;
}) {
  const isEditing = editRow != null;
  const [date,           setDate]           = useState(today());
  const [company,        setCompany]        = useState("");
  const [analyst,        setAnalyst]        = useState("");
  const [recommendation, setRecommendation] = useState("");
  const [type,           setType]           = useState("");
  const [currentPrice,   setCurrentPrice]   = useState("");
  const [targetPrice,    setTargetPrice]    = useState("");
  const [ticker,         setTicker]         = useState("");
  const [isin,           setIsin]           = useState("");

  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  // Al abrir en modo edición, precargar los campos con la fila seleccionada.
  useEffect(() => {
    if (open && editRow) {
      setDate(editRow.date);
      setCompany(editRow.company);
      setAnalyst(editRow.analyst);
      setRecommendation(editRow.recommendation);
      setType(editRow.type);
      setCurrentPrice(String(editRow.currentPrice));
      setTargetPrice(String(editRow.targetPrice));
      setTicker(""); setIsin(""); setError(null);
    }
  }, [open, editRow]);

  // A company is "new" when it isn't already mapped in CompanyIsin.
  // Al editar, la empresa ya existe → nunca se trata como nueva.
  const isNewCompany = useMemo(() => {
    if (isEditing) return false;
    const c = company.trim();
    if (!c || !options) return false;
    return !options.mappedCompanies.includes(c);
  }, [company, options, isEditing]);

  if (!open) return null;

  function reset() {
    setDate(today()); setCompany(""); setAnalyst(""); setRecommendation("");
    setType(""); setCurrentPrice(""); setTargetPrice("");
    setTicker(""); setIsin(""); setError(null);
  }

  function close() { reset(); onClose(); }

  async function save() {
    setError(null);

    const missing: string[] = [];
    if (!date)                    missing.push("date");
    if (!company.trim())          missing.push("company");
    if (!analyst.trim())          missing.push("analyst");
    if (!recommendation.trim())   missing.push("recommendation");
    if (!type.trim())             missing.push("type");
    if (currentPrice === "" || isNaN(Number(currentPrice))) missing.push("current price");
    if (targetPrice  === "" || isNaN(Number(targetPrice)))  missing.push("target price");
    if (isNewCompany && !ticker.trim()) missing.push("Yahoo ticker (new company)");
    if (missing.length) { setError(`Please complete: ${missing.join(", ")}.`); return; }

    setSaving(true);
    try {
      const url    = isEditing
        ? `/api/analysis/track-record/recommendations/${editRow!.id}`
        : "/api/analysis/track-record/recommendations";
      const method = isEditing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          type:           type.trim(),
          analyst:        analyst.trim(),
          company:        company.trim(),
          recommendation: recommendation.trim(),
          currentPrice:   Number(currentPrice),
          targetPrice:    Number(targetPrice),
          // Sólo relevante al crear (empresa nueva): al editar el backend lo ignora.
          yahooFinanceTicker: ticker.trim() || undefined,
          isin:               isin.trim()   || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save.");
      const saved = company.trim();
      reset();
      onSaved(saved);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      onMouseDown={close}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(13,13,56,0.45)", backdropFilter: "blur(2px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div
        onMouseDown={e => e.stopPropagation()}
        style={{
          width: 560, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto",
          background: "#FFFFFF", borderRadius: 14, border: `1px solid ${BORDER}`,
          boxShadow: "0 18px 50px rgba(13,13,56,0.22)",
        }}
      >
        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: TEXT1 }}>
              {isEditing ? "Edit recommendation" : "Add recommendation"}
            </h3>
            <p style={{ margin: "2px 0 0", fontSize: 11.5, color: TEXT2 }}>
              {isEditing
                ? "Updates the selected analyst-history row."
                : `Inserts a row into the analyst history${isNewCompany ? " and registers the new company" : ""}.`}
            </p>
          </div>
          <button onClick={close} style={{ background: "none", border: "none", fontSize: 22, lineHeight: 1, color: TEXT3, cursor: "pointer", padding: 0 }}>×</button>
        </div>

        {/* Body */}
        <div style={{ padding: "18px 20px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field label="Date">
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Analyst">
            <input list="atr-analysts" value={analyst} onChange={e => setAnalyst(e.target.value)}
              placeholder="e.g. RM" style={inputStyle} />
            <datalist id="atr-analysts">{(options?.analysts ?? []).map(a => <option key={a} value={a} />)}</datalist>
          </Field>

          <div style={{ gridColumn: "1 / -1" }}>
            <Field label="Company" hint={isNewCompany ? "New company — will be added to company_isins" : undefined}>
              <input list="atr-companies" value={company} onChange={e => setCompany(e.target.value)}
                placeholder="Pick existing or type a new one" style={inputStyle} />
              <datalist id="atr-companies">{(options?.companies ?? []).map(c => <option key={c} value={c} />)}</datalist>
            </Field>
          </div>

          {/* New-company mapping fields */}
          {isNewCompany && (
            <>
              <Field label="Yahoo ticker" hint="Required — e.g. CMPC.SN, BBAS3.SA">
                <input value={ticker} onChange={e => setTicker(e.target.value)}
                  placeholder="TICKER.SN" style={{ ...inputStyle, borderColor: "rgba(32,68,220,0.35)" }} />
              </Field>
              <Field label="ISIN (optional)">
                <input value={isin} onChange={e => setIsin(e.target.value)} placeholder="—" style={inputStyle} />
              </Field>
            </>
          )}

          <Field label="Recommendation">
            <select value={recommendation} onChange={e => setRecommendation(e.target.value)}
              style={{ ...inputStyle, cursor: "pointer" }}>
              <option value="">Select…</option>
              <option value="Comprar">Comprar</option>
              <option value="Vender">Vender</option>
              <option value="Mantener">Mantener</option>
            </select>
          </Field>
          <Field label="Type">
            <input list="atr-types" value={type} onChange={e => setType(e.target.value)}
              placeholder="e.g. Initiation / Update" style={inputStyle} />
            <datalist id="atr-types">{(options?.types ?? []).map(t => <option key={t} value={t} />)}</datalist>
          </Field>

          <Field label="Current price">
            <input type="number" value={currentPrice} onChange={e => setCurrentPrice(e.target.value)}
              placeholder="0.00" style={{ ...inputStyle, fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums" }} />
          </Field>
          <Field label="Target price">
            <input type="number" value={targetPrice} onChange={e => setTargetPrice(e.target.value)}
              placeholder="0.00" style={{ ...inputStyle, fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums" }} />
          </Field>
        </div>

        {/* Error */}
        {error && (
          <div style={{ margin: "0 20px", padding: "9px 12px", borderRadius: 8, fontSize: 12, color: RED, background: "rgba(248,72,94,0.06)", border: "1px solid rgba(248,72,94,0.20)" }}>
            {error}
          </div>
        )}

        {/* Footer */}
        <div style={{ padding: "16px 20px", borderTop: `1px solid ${BORDER}`, display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
          <button onClick={close} disabled={saving}
            style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${BORDER}`, background: "#FFFFFF", color: TEXT2, fontSize: 12.5, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer" }}>
            Cancel
          </button>
          <button onClick={save} disabled={saving}
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "8px 18px", borderRadius: 8, border: "none",
              // Estado deshabilitado: se sube el alpha para que el texto blanco siga legible.
              background: saving ? "rgba(0,30,175,0.60)" : GREEN, color: "#FFFFFF",
              fontSize: 12.5, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer",
              boxShadow: saving ? "none" : "0 1px 3px rgba(0,30,175,0.35)",
            }}>
            {saving && (
              <span style={{ width: 13, height: 13, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.45)", borderTopColor: "#FFFFFF", animation: "spin 0.8s linear infinite" }} />
            )}
            {saving ? "Saving…" : isEditing ? "Save changes" : "Save recommendation"}
          </button>
        </div>
      </div>
    </div>
  );
}
