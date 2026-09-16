"use client";

import { useRef, useState, useEffect } from "react";
import { X, ChevronDown } from "lucide-react";
import { FONT_SECONDARY } from "@/lib/patriaTheme";

export interface CompanyOption { ticker: string; nombre: string; }

interface Props {
  /** Ticker Bloomberg seleccionado ("" = nada). */
  value: string;
  onChange: (ticker: string, nombre: string) => void;
  disabled: boolean;
  /**
   * true = suma también `universe` de /api/companies/list (empresas de la maestra sin
   * datos en el deep-dive). Las fichas lo necesitan: una compañía puede tener ficha
   * antes de tener modelo o posición. Default false = sólo `companies`, el contrato
   * que usan las presentaciones.
   */
  includeUniverse?: boolean;
  placeholder?: string;
}

const INPUT: React.CSSProperties = {
  width: "100%", padding: "8px 11px",
  border: "1px solid rgba(13,13,56,0.14)", borderRadius: 7,
  fontSize: 13, color: "#0D0D38", background: "#F5F7FD",
  outline: "none", fontFamily: FONT_SECONDARY, boxSizing: "border-box",
};

export default function CompanyCombobox({
  value,
  onChange,
  disabled,
  includeUniverse = false,
  placeholder = "Search company or ticker…",
}: Props) {
  const [query,   setQuery]   = useState("");
  const [open,    setOpen]    = useState(false);
  const [options, setOptions] = useState<CompanyOption[]>([]);
  const [display, setDisplay] = useState("");   // human-readable label shown in input
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Load company list once
  useEffect(() => {
    fetch("/api/companies/list")
      .then((r) => r.json())
      .then((d: { companies?: CompanyOption[]; universe?: CompanyOption[] }) =>
        setOptions([...(d.companies ?? []), ...(includeUniverse ? d.universe ?? [] : [])]),
      )
      .catch(() => {});
  }, [includeUniverse]);

  // Sync display label when value is set externally
  useEffect(() => {
    if (!value) { setDisplay(""); return; }
    const match = options.find((o) => o.ticker === value);
    if (match) setDisplay(`${match.nombre} — ${match.ticker}`);
  }, [value, options]);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = query.trim()
    ? options.filter(
        (o) =>
          o.nombre.toLowerCase().includes(query.toLowerCase()) ||
          o.ticker.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 8)
    : options.slice(0, 8);

  function handleSelect(opt: CompanyOption) {
    setDisplay(`${opt.nombre} — ${opt.ticker}`);
    setQuery("");
    setOpen(false);
    onChange(opt.ticker, opt.nombre);
  }

  function handleClear() {
    setDisplay("");
    setQuery("");
    onChange("", "");
  }

  const showClear = !!(display || query) && !disabled;

  return (
    <div ref={wrapperRef} style={{ position: "relative" }}>
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        <input
          value={open ? query : (display || query)}
          onChange={(e) => { setQuery(e.target.value); setDisplay(""); setOpen(true); onChange("", ""); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          style={{
            ...INPUT,
            paddingRight: 56,
            opacity: disabled ? 0.6 : 1,
          }}
          autoComplete="off"
        />
        {showClear && (
          <button
            type="button"
            onClick={handleClear}
            style={{ position: "absolute", right: 28, background: "none", border: "none", cursor: "pointer", color: "rgba(13,13,56,0.45)", padding: 2, display: "flex" }}
          >
            <X size={12} />
          </button>
        )}
        <ChevronDown
          size={13}
          style={{ position: "absolute", right: 10, color: "rgba(13,13,56,0.45)", pointerEvents: "none" }}
        />
      </div>

      {open && filtered.length > 0 && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 100,
          background: "#fff",
          border: "1px solid rgba(13,13,56,0.12)",
          borderRadius: 8,
          boxShadow: "0 8px 24px rgba(13,13,56,0.12)",
          maxHeight: 220,
          overflowY: "auto",
        }}>
          {filtered.map((opt) => (
            <button
              key={opt.ticker}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); handleSelect(opt); }}
              style={{
                display: "flex", flexDirection: "column", alignItems: "flex-start",
                width: "100%", padding: "8px 12px",
                background: "none", border: "none", cursor: "pointer",
                borderBottom: "1px solid rgba(13,13,56,0.05)",
                textAlign: "left",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(32,68,220,0.05)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
            >
              <span style={{ fontSize: 12, fontWeight: 600, color: "#0D0D38" }}>{opt.nombre}</span>
              <span style={{ fontSize: 10, color: "rgba(13,13,56,0.45)", fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums" }}>{opt.ticker}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
