"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { AlertTriangle, Check, ChevronDown, Loader2, Search, Trash2 } from "lucide-react";
import { FONT_SECONDARY, PATRIA, TEXT, BORDER, SURFACE } from "@/lib/patriaTheme";
import type { OrphanNote } from "@/app/api/research/orphans/route";
import type { ResearchTicker } from "@/app/api/research/tickers/route";

// ── Ticker picker ─────────────────────────────────────────────────────────────
// Combo con buscador sobre el universo completo de empresas_industrias_v2. No es un
// <select> nativo porque son ~680 tickers y hay que poder filtrar por nombre además
// de por ticker (el analista escribe "FALABELLA", no "FALAB CI EQUITY").

function TickerPicker({
  tickers, value, onChange, disabled,
}: {
  tickers:  ResearchTicker[];
  value:    string | null;
  onChange: (ticker: string) => void;
  disabled?: boolean;
}) {
  const [open,  setOpen]  = useState(false);
  const [query, setQuery] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? tickers.filter((t) => t.ticker.toLowerCase().includes(q) || t.name.toLowerCase().includes(q))
      : tickers;
    return base.slice(0, 60);   // la lista es larga: se corta para no colgar el render
  }, [tickers, query]);

  return (
    <div ref={boxRef} style={{ position: "relative", minWidth: 0 }}>
      <button
        onClick={() => { if (!disabled) { setOpen((o) => !o); setQuery(""); } }}
        disabled={disabled}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6,
          width: "100%", padding: "6px 9px", borderRadius: 7,
          border: `1px solid ${value ? "rgba(32,68,220,0.35)" : BORDER.base}`,
          background: value ? "rgba(32,68,220,0.06)" : SURFACE.card,
          color: value ? PATRIA.kingBlue : TEXT.muted,
          fontSize: 11.5, fontWeight: value ? 700 : 500,
          fontFamily: FONT_SECONDARY, cursor: disabled ? "not-allowed" : "pointer",
          textAlign: "left", opacity: disabled ? 0.55 : 1,
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {value ?? "Asignar ticker…"}
        </span>
        <ChevronDown size={12} style={{ flexShrink: 0 }} />
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 40,
          width: 300, maxWidth: "80vw",
          background: SURFACE.card, border: `1px solid ${BORDER.strong}`, borderRadius: 9,
          boxShadow: "0 12px 32px rgba(13,13,56,0.16)", overflow: "hidden",
        }}>
          <div style={{ position: "relative", padding: 7, borderBottom: `1px solid ${BORDER.subtle}` }}>
            <Search size={11} style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", color: TEXT.muted }} />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar ticker o nombre…"
              style={{
                width: "100%", boxSizing: "border-box", padding: "5px 8px 5px 24px",
                borderRadius: 6, border: `1px solid ${BORDER.base}`, background: SURFACE.subtle,
                fontSize: 11.5, color: PATRIA.darkBlue, outline: "none", fontFamily: FONT_SECONDARY,
              }}
            />
          </div>
          <div style={{ maxHeight: 240, overflowY: "auto" }}>
            {filtered.length === 0 ? (
              <div style={{ padding: "14px 10px", fontSize: 11, color: TEXT.disabled, textAlign: "center" }}>
                Sin resultados
              </div>
            ) : filtered.map((t) => (
              <button
                key={t.ticker}
                onClick={() => { onChange(t.ticker); setOpen(false); }}
                style={{
                  display: "block", width: "100%", textAlign: "left",
                  padding: "6px 10px", border: "none", background: "transparent", cursor: "pointer",
                  borderBottom: `1px solid ${BORDER.subtle}`,
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = SURFACE.hover; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <div style={{ fontSize: 11.5, fontWeight: 700, color: PATRIA.darkBlue, fontFamily: FONT_SECONDARY }}>
                  {t.ticker}
                </div>
                <div style={{ fontSize: 10, color: TEXT.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {t.name}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Orphan row ────────────────────────────────────────────────────────────────

function OrphanRow({
  note, tickers, onResolved,
}: {
  note:       OrphanNote;
  tickers:    ResearchTicker[];
  onResolved: () => void;
}) {
  const [pick,   setPick]   = useState<string | null>(null);
  const [busy,   setBusy]   = useState(false);
  const [err,    setErr]    = useState<string | null>(null);

  async function assign() {
    if (!pick) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/research/${note.id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ company: pick }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "No se pudo asignar el ticker.");
      onResolved();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm("¿Eliminar esta nota? Esta acción no se puede deshacer.")) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/research/${note.id}`, { method: "DELETE" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "No se pudo eliminar.");
      onResolved();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  const rawLabel = note.company.trim() === "" ? "(vacío)" : `"${note.company}"`;

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "78px minmax(140px,1.4fr) 130px 190px 96px",
      gap: "0 12px", alignItems: "center",
      padding: "9px 16px", borderBottom: `1px solid ${BORDER.subtle}`,
    }}>
      {/* Fecha */}
      <div style={{ fontSize: 10.5, color: TEXT.muted, fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
        {note.date}
      </div>

      {/* Título */}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11.5, color: PATRIA.darkBlue, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {note.title ?? note.subject ?? "Sin título"}
        </div>
        <div style={{ fontSize: 9.5, color: TEXT.disabled, marginTop: 1 }}>{note.category}</div>
      </div>

      {/* Valor crudo que no matcheó */}
      <div style={{
        fontSize: 10.5, fontFamily: FONT_SECONDARY, color: PATRIA.orange,
        background: "rgba(255,107,6,0.07)", border: "1px solid rgba(255,107,6,0.24)",
        borderRadius: 5, padding: "2px 7px", whiteSpace: "nowrap",
        overflow: "hidden", textOverflow: "ellipsis",
      }}>
        {rawLabel}
      </div>

      {/* Picker + sugerencias */}
      <div style={{ minWidth: 0 }}>
        <TickerPicker tickers={tickers} value={pick} onChange={setPick} disabled={busy} />
        {!pick && note.suggestions.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
            {note.suggestions.map((s) => (
              <button
                key={s.ticker}
                onClick={() => setPick(s.ticker)}
                title={s.nombre}
                style={{
                  fontSize: 9.5, fontFamily: FONT_SECONDARY, color: PATRIA.kingBlue,
                  background: "rgba(32,68,220,0.06)", border: "1px solid rgba(32,68,220,0.20)",
                  borderRadius: 4, padding: "1px 5px", cursor: "pointer", whiteSpace: "nowrap",
                }}
              >
                {s.ticker}
              </button>
            ))}
          </div>
        )}
        {err && <div style={{ fontSize: 10, color: PATRIA.pink, marginTop: 4 }}>{err}</div>}
      </div>

      {/* Acciones */}
      <div style={{ display: "flex", alignItems: "center", gap: 5, justifyContent: "flex-end" }}>
        <button
          onClick={assign}
          disabled={!pick || busy}
          title={pick ? `Asignar a ${pick}` : "Elige un ticker primero"}
          style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "5px 9px", borderRadius: 7, border: "none",
            background: !pick || busy ? "rgba(32,68,220,0.35)" : PATRIA.kingBlue,
            color: PATRIA.white, fontSize: 11, fontWeight: 700,
            cursor: !pick || busy ? "not-allowed" : "pointer",
          }}
        >
          {busy ? <Loader2 size={11} style={{ animation: "spin 0.8s linear infinite" }} /> : <Check size={11} />}
          Asignar
        </button>
        <button
          onClick={remove}
          disabled={busy}
          title="Eliminar la nota"
          style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 26, height: 26, borderRadius: 7,
            background: "rgba(248,72,94,0.06)", border: "1px solid rgba(248,72,94,0.22)",
            color: PATRIA.pink, cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

/**
 * Bandeja de notas huérfanas (solo admin).
 *
 * Una nota es huérfana cuando su `company` no existe en empresas_industrias_v2: como
 * el sidebar solo lista tickers de la maestra, esa nota no es visible desde ninguna
 * compañía. Acá se enumeran todas y se resuelven asignando el ticker correcto.
 */
export default function OrphanNotesPanel({ onResolved }: { onResolved?: () => void }) {
  const [notes,    setNotes]    = useState<OrphanNote[]>([]);
  const [tickers,  setTickers]  = useState<ResearchTicker[]>([]);
  // Arranca abierta: es una bandeja de trabajo pendiente, no un aviso pasivo.
  const [open,     setOpen]     = useState(true);
  const [loading,  setLoading]  = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/research/orphans")
      .then((r) => (r.ok ? r.json() : { notes: [] }))
      .then((d: { notes?: OrphanNote[] }) => setNotes(d.notes ?? []))
      .catch(() => setNotes([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    fetch("/api/research/tickers")
      .then((r) => r.json())
      .then((d: { tickers?: ResearchTicker[] }) => setTickers(d.tickers ?? []))
      .catch(() => setTickers([]));
  }, [load]);

  function handleResolved() {
    load();
    onResolved?.();
  }

  if (loading && notes.length === 0) return null;
  if (notes.length === 0) return null;

  return (
    <div style={{
      background: "rgba(255,107,6,0.045)",
      border: "1px solid rgba(255,107,6,0.28)",
      borderRadius: 10, overflow: "hidden", marginBottom: 16,
    }}>
      {/* Cabecera / toggle */}
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 9, width: "100%",
          padding: "9px 14px", background: "transparent", border: "none",
          cursor: "pointer", textAlign: "left",
        }}
      >
        <AlertTriangle size={14} style={{ color: PATRIA.orange, flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: PATRIA.darkBlue }}>
          {notes.length} nota{notes.length !== 1 ? "s" : ""} sin ticker asignado
        </span>
        <span style={{ fontSize: 11, color: TEXT.muted, flex: 1 }}>
          No son visibles en ninguna compañía hasta que las asignes
        </span>
        <ChevronDown
          size={13}
          style={{ color: TEXT.muted, flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}
        />
      </button>

      {open && (
        <div style={{ background: SURFACE.card, borderTop: "1px solid rgba(255,107,6,0.22)" }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: "78px minmax(140px,1.4fr) 130px 190px 96px",
            gap: "0 12px", padding: "7px 16px",
            background: SURFACE.subtle, borderBottom: `1px solid ${BORDER.subtle}`,
          }}>
            {["Fecha", "Nota", "Valor recibido", "Ticker correcto", ""].map((h, i) => (
              <div key={i} style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.09em", color: TEXT.muted, textTransform: "uppercase" }}>
                {h}
              </div>
            ))}
          </div>
          {notes.map((n) => (
            <OrphanRow key={n.id} note={n} tickers={tickers} onResolved={handleResolved} />
          ))}
        </div>
      )}
    </div>
  );
}
