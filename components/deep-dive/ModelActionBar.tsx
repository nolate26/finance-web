"use client";

import { ArrowLeft, FileDown, FileSpreadsheet, Trash2 } from "lucide-react";
import LastFichaButton from "@/components/deep-dive/LastFichaButton";
import { PATRIA, FONT_SECONDARY, TEXT, BORDER } from "@/lib/patriaTheme";

// Barra entre el panel del modelo y la tabla, compartida por compañías y bancos. Va en
// cuatro grupos rotulados: a la izquierda lo que se LEE (precio y ficha), a la derecha
// lo que se HACE (versión y export). Los valores llegan ya formateados porque cada
// explorador tiene su propio formato de precio.

const CHIP_H = 30;

const MONO: React.CSSProperties = { fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums" };

const chip: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, height: CHIP_H, boxSizing: "border-box",
  padding: "0 11px", borderRadius: 6, fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap",
};

const outlineBtn: React.CSSProperties = {
  ...chip, background: PATRIA.white, color: PATRIA.kingBlue,
  border: "1px solid rgba(32,68,220,0.30)", cursor: "pointer", outline: "none",
};

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
      <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: TEXT.muted }}>
        {label}
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>{children}</div>
    </div>
  );
}

interface Props {
  ticker:          string;
  /** Precio de mercado usado en los años proyectados. null = no hay. */
  price:           { value: string; date: string; note?: string } | null;
  /** Versiones del modelo, la más reciente primero. */
  versions:        { value: string; label: string }[];
  selectedVersion: string;
  onSelectVersion: (value: string) => void;
  onExport:        (format: "xlsx" | "pdf") => void;
  /** Sólo llega para admin. */
  onDelete?:       () => void;
  deleting:        boolean;
}

export default function ModelActionBar({
  ticker, price, versions, selectedVersion, onSelectVersion, onExport, onDelete, deleting,
}: Props) {
  const latest = versions[0]?.value;

  return (
    <div style={{
      display: "flex", alignItems: "flex-end", gap: "12px 22px", flexWrap: "wrap",
      padding: "10px 14px", background: PATRIA.white,
      border: `1px solid ${BORDER.base}`, borderRadius: 10,
    }}>
      <Group label="Last price">
        {price ? (
          <span style={{
            ...chip, background: "rgba(70,232,224,0.16)", color: PATRIA.darkBlue,
            border: `1px solid ${PATRIA.turquoise}`,
          }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: PATRIA.turquoise, flexShrink: 0 }} />
            <span style={{ ...MONO, fontSize: 13, fontWeight: 800 }}>{price.value}</span>
            <span style={{ ...MONO, fontWeight: 600, color: TEXT.label }}>{price.date}</span>
          </span>
        ) : (
          <span style={{ ...chip, background: "rgba(13,13,56,0.04)", color: TEXT.muted, border: `1px solid ${BORDER.base}` }}>
            No market price
          </span>
        )}
        {price?.note && <span style={{ fontSize: 10.5, fontWeight: 600, color: TEXT.label }}>{price.note}</span>}
      </Group>

      <Group label="Last ficha">
        <LastFichaButton ticker={ticker} />
      </Group>

      {/* El margen empuja este grupo y el siguiente a la derecha; si no caben, bajan. */}
      <div style={{ marginLeft: "auto" }}>
        <Group label="Model version">
          <select
            value={selectedVersion}
            onChange={e => onSelectVersion(e.target.value)}
            style={{
              ...MONO, height: CHIP_H, padding: "0 8px", borderRadius: 6, fontSize: 12.5, fontWeight: 700,
              minWidth: 116, background: PATRIA.white, color: PATRIA.darkBlue,
              border: `1px solid ${BORDER.base}`, cursor: "pointer", outline: "none",
            }}
          >
            {versions.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
          </select>

          {selectedVersion !== latest && (
            <button onClick={() => onSelectVersion(latest)} style={outlineBtn}>
              <ArrowLeft size={13} /> Latest
            </button>
          )}

          {onDelete && (
            <button
              onClick={onDelete}
              disabled={deleting}
              title="Delete this model version"
              style={{
                ...chip, background: "transparent", color: PATRIA.pink,
                border: "1px solid rgba(248,72,94,0.35)", outline: "none",
                cursor: deleting ? "not-allowed" : "pointer",
              }}
            >
              <Trash2 size={13} />
              {deleting ? "Deleting…" : "Delete"}
            </button>
          )}
        </Group>
      </div>

      <Group label="Export">
        <button onClick={() => onExport("xlsx")} style={outlineBtn}>
          <FileSpreadsheet size={13} /> Excel
        </button>
        <button onClick={() => onExport("pdf")} style={outlineBtn}>
          <FileDown size={13} /> PDF
        </button>
      </Group>
    </div>
  );
}
