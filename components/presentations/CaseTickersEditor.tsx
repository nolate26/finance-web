"use client";

import { useState } from "react";
import { X, Plus } from "lucide-react";
import CompanyCombobox from "@/components/CompanyCombobox";
import { RECOMMENDATIONS, recommendationColors, type Recommendation } from "@/lib/recommendations";
import { FONT_SECONDARY, PATRIA, TEXT, BORDER } from "@/lib/patriaTheme";

/**
 * Empresas cubiertas por un investment case, con su target price y recomendación.
 *
 * Lo usan el uploader (al subir el caso) y el panel de revisión del admin, así que
 * la edición es idéntica en los dos lados. El TP y la recomendación son POR ACCIÓN:
 * un caso sobre CCU y Andina lleva un precio objetivo para cada una.
 */

export interface CaseTicker {
  ticker:         string;
  company_name:   string;
  target_price:   number | null;
  recommendation: Recommendation | null;
}

const INPUT: React.CSSProperties = {
  padding: "5px 9px", borderRadius: 6,
  border: `1px solid ${BORDER.strong}`, background: "#F5F7FD",
  fontSize: 12, color: TEXT.body, outline: "none",
  fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums",
  boxSizing: "border-box",
};

export default function CaseTickersEditor({
  value, onChange, disabled = false,
}: {
  value:    CaseTicker[];
  onChange: (next: CaseTicker[]) => void;
  disabled?: boolean;
}) {
  // El combobox se remonta al agregar (cambia la key) para que se limpie solo:
  // mantiene su propio texto interno y no se vacía con un value controlado.
  const [pickerKey, setPickerKey] = useState(0);

  function add(ticker: string, nombre: string) {
    if (!ticker) return;
    if (value.some((t) => t.ticker.toUpperCase() === ticker.toUpperCase())) {
      setPickerKey((k) => k + 1);   // ya estaba: limpiamos el buscador sin duplicar
      return;
    }
    onChange([...value, { ticker, company_name: nombre || ticker, target_price: null, recommendation: null }]);
    setPickerKey((k) => k + 1);
  }

  function update(ticker: string, patch: Partial<CaseTicker>) {
    onChange(value.map((t) => (t.ticker === ticker ? { ...t, ...patch } : t)));
  }

  function remove(ticker: string) {
    onChange(value.filter((t) => t.ticker !== ticker));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>

      {/* Buscador para sumar empresas */}
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <Plus size={13} style={{ color: PATRIA.kingBlue, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <CompanyCombobox
            key={pickerKey}
            value=""
            onChange={add}
            disabled={disabled}
            includeUniverse
            placeholder={value.length ? "Add another company…" : "Search the company this case covers…"}
          />
        </div>
      </div>

      {value.length === 0 && (
        <p style={{ fontSize: 11, color: TEXT.muted, margin: 0, fontStyle: "italic" }}>
          Pick at least one company. Each one gets its own target price and rating.
        </p>
      )}

      {/* Una tarjeta por empresa: TP + recomendación */}
      {value.map((t) => {
        const c = recommendationColors(t.recommendation);
        return (
          <div
            key={t.ticker}
            style={{
              display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
              padding: "9px 11px", borderRadius: 9,
              background: "#F5F7FD", border: `1px solid ${BORDER.base}`,
            }}
          >
            {/* Empresa */}
            <div style={{ flex: "1 1 150px", minWidth: 0 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: TEXT.body, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {t.company_name}
              </p>
              <p style={{ fontSize: 10, color: TEXT.muted, margin: "1px 0 0", fontFamily: FONT_SECONDARY }}>{t.ticker}</p>
            </div>

            {/* Target price */}
            <label style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: TEXT.label }}>TP</span>
              <input
                value={t.target_price ?? ""}
                onChange={(e) => {
                  const raw = e.target.value.replace(/[^0-9.,-]/g, "").replace(",", ".");
                  const n = raw === "" ? null : Number(raw);
                  update(t.ticker, { target_price: n != null && Number.isFinite(n) ? n : null });
                }}
                inputMode="decimal"
                placeholder="—"
                disabled={disabled}
                style={{ ...INPUT, width: 84, textAlign: "right" }}
              />
            </label>

            {/* Recomendación */}
            <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
              {RECOMMENDATIONS.map((r) => {
                const on = t.recommendation === r;
                const rc = recommendationColors(r);
                return (
                  <button
                    key={r}
                    type="button"
                    disabled={disabled}
                    // Volver a tocar la activa la deselecciona: un caso puede no traer rating.
                    onClick={() => update(t.ticker, { recommendation: on ? null : r })}
                    style={{
                      padding: "4px 11px", borderRadius: 6, fontSize: 10.5, fontWeight: 800, letterSpacing: "0.05em",
                      cursor: disabled ? "not-allowed" : "pointer",
                      border: `1px solid ${on ? rc.border : BORDER.strong}`,
                      background: on ? rc.bg : "#fff",
                      color: on ? rc.text : TEXT.muted,
                    }}
                  >
                    {r}
                  </button>
                );
              })}
            </div>

            {/* Quitar */}
            {!disabled && (
              <button
                type="button"
                onClick={() => remove(t.ticker)}
                title={`Remove ${t.ticker}`}
                style={{ background: "none", border: "none", cursor: "pointer", color: TEXT.muted, padding: 2, display: "flex", flexShrink: 0 }}
              >
                <X size={13} />
              </button>
            )}

            {/* Franja de color de la recomendación elegida */}
            <span aria-hidden style={{ width: "100%", height: 2, borderRadius: 2, background: t.recommendation ? c.border : "transparent" }} />
          </div>
        );
      })}
    </div>
  );
}
