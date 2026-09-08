"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { X, Loader2, Activity } from "lucide-react";
import { FONT_SECONDARY, TEXT, BORDER, PATRIA } from "@/lib/patriaTheme";
import type { FreshnessItem, SystemStatusPayload } from "@/app/api/system-status/route";

// Modal de frescura de datos, reutilizado por dos montajes:
//   · el global del layout raíz (scope "global"),
//   · la alerta propia de Chile → Stock Selection (scope "stock-selection").
//
// CUÁNDO APARECE. El global vive en el layout, así que NO se remonta al navegar con
// el router — eso ya descarta el caso molesto. Sobre eso hay dos reglas:
//   · sessionStorage marca el ámbito como visto → no reaparece dentro de la sesión.
//   · Pero sessionStorage SOBREVIVE a un F5, y un refresco manual es justo cuando
//     quieres ver si entraron datos nuevos. Por eso se consulta además el tipo de
//     navegación: si el browser dice "reload", se muestra igual.

const STATUS_STYLE: Record<FreshnessItem["status"], { dot: string; text: string; label: string }> = {
  // El manual PATRIA no tiene verde ni rojo: fresco es el azul corporativo, la alerta
  // naranjo, y lo vencido el rosado que el manual usa como negativo.
  fresh:   { dot: PATRIA.blue,           text: "#001EAF",  label: "Up to date" },
  warn:    { dot: PATRIA.orange,         text: "#8A3A00",  label: "Ageing" },
  stale:   { dot: PATRIA.pink,           text: "#B01029",  label: "Stale" },
  unknown: { dot: "rgba(13,13,56,0.24)", text: TEXT.muted, label: "No data" },
};

const RANK = { fresh: 0, unknown: 1, warn: 1, stale: 2 } as const;
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/** "11/Aug/2026" — el formato que pidió el equipo. */
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${MONTHS[Number(m) - 1]}/${y}`;
}

function fmtAge(days: number | null): string {
  if (days === null) return "";
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

// ── Coordinación entre los dos modales ───────────────────────────────────────
// Entrar a /chile con un refresco dispara los dos a la vez (Chile abre en Stock
// Selection). Apilarlos sería ilegible, así que el segundo espera a que el primero
// se cierre. Es un flag de módulo + un evento: no amerita un contexto de React.
let globalModalOpen = false;
const FREE_EVENT = "patria:freshness-free";

function markOpen()  { globalModalOpen = true; }
function markClosed() {
  globalModalOpen = false;
  try { window.dispatchEvent(new CustomEvent(FREE_EVENT)); } catch { /* SSR */ }
}

/** true si toca mostrar este ámbito en esta carga. Nunca lanza. */
function shouldOpen(storageKey: string): boolean {
  try {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const isReload = nav?.type === "reload";
    const seen = window.sessionStorage.getItem(storageKey) === "1";
    return isReload || !seen;
  } catch {
    // Modo privado o storage bloqueado: se muestra igual, es preferible a no mostrarlo.
    return true;
  }
}

function markSeen(storageKey: string) {
  try { window.sessionStorage.setItem(storageKey, "1"); } catch { /* no pasa nada */ }
}

interface Props {
  scope:      "global" | "stock-selection";
  title:      string;
  subtitle:   string;
  storageKey: string;
  /** El global bloquea al otro mientras está abierto; el de SS espera su turno. */
  blocking?:  boolean;
}

export default function FreshnessModal({ scope, title, subtitle, storageKey, blocking }: Props) {
  const { status } = useSession();
  const [open, setOpen]   = useState(false);
  const [data, setData]   = useState<SystemStatusPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    if (blocking) markClosed();
  }, [blocking]);

  // Sólo con sesión: el endpoint exige autenticación y en /login no aporta nada.
  useEffect(() => {
    if (status !== "authenticated" || !shouldOpen(storageKey)) return;
    markSeen(storageKey);

    let alive = true;
    let offFree: (() => void) | undefined;

    function reveal() {
      if (!alive) return;
      if (blocking) markOpen();
      setOpen(true);
    }

    fetch(`/api/system-status?scope=${scope}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("status " + r.status))))
      .then((d: SystemStatusPayload) => {
        if (!alive) return;
        setData(d);
        // Se abre recién con los datos: nada de modal vacío parpadeando.
        if (!blocking && globalModalOpen) {
          const onFree = () => reveal();
          window.addEventListener(FREE_EVENT, onFree, { once: true });
          offFree = () => window.removeEventListener(FREE_EVENT, onFree);
        } else {
          reveal();
        }
      })
      .catch(() => { if (alive) setError("No se pudo leer el estado de los datos"); });

    return () => { alive = false; offFree?.(); };
  }, [status, scope, storageKey, blocking]);

  // Escape cierra.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") close(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  // Si el componente se desmonta abierto (p.ej. cambio de pestaña en Chile), hay que
  // liberar el candado o el otro modal quedaría esperando para siempre.
  useEffect(() => () => { if (blocking) markClosed(); }, [blocking]);

  if (!open || (!data && !error)) return null;

  const worst = data?.items.reduce<FreshnessItem["status"]>(
    (acc, i) => (RANK[i.status] > RANK[acc] ? i.status : acc), "fresh") ?? "unknown";

  // Filas agrupadas por sección del navbar, en el orden en que llegan del servidor.
  const sections: { name: string; rows: FreshnessItem[] }[] = [];
  for (const it of data?.items ?? []) {
    const last = sections[sections.length - 1];
    if (last && last.name === it.section) last.rows.push(it);
    else sections.push({ name: it.section, rows: [it] });
  }

  return (
    <div
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(13,13,56,0.45)", backdropFilter: "blur(3px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#FFFFFF", borderRadius: 14, width: "min(470px, 100%)",
          maxHeight: "88vh", display: "flex", flexDirection: "column",
          boxShadow: "0 24px 70px rgba(13,13,56,0.30)",
          border: `1px solid ${BORDER.base}`, overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "15px 18px", borderBottom: `1px solid ${BORDER.subtle}`, background: "#F5F7FD",
        }}>
          <span style={{
            width: 30, height: 30, borderRadius: 9, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: `${STATUS_STYLE[worst].dot}18`,
            border: `1px solid ${STATUS_STYLE[worst].dot}38`,
          }}>
            <Activity size={15} style={{ color: STATUS_STYLE[worst].dot }} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: PATRIA.darkBlue, letterSpacing: "-0.015em" }}>
              {title}
            </div>
            <div style={{ fontSize: 11, color: TEXT.muted, marginTop: 1 }}>
              {subtitle}
            </div>
          </div>
          <button
            onClick={close}
            aria-label="Close"
            style={{ background: "transparent", border: "none", cursor: "pointer", color: TEXT.label, padding: 3, display: "flex" }}
          >
            <X size={17} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "8px 8px 10px", overflowY: "auto" }}>
          {error ? (
            <p style={{ fontSize: 12.5, color: "#B01029", textAlign: "center", padding: "26px 12px", margin: 0 }}>
              {error}
            </p>
          ) : !data ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 9, padding: "30px 0" }}>
              <Loader2 size={15} style={{ animation: "spin 0.8s linear infinite", color: PATRIA.kingBlue }} />
              <span style={{ fontSize: 12, color: TEXT.label }}>Checking…</span>
            </div>
          ) : (
            sections.map((sec) => (
              <div key={sec.name} style={{ marginBottom: 6 }}>
                {/* Encabezado de sección = el nombre tal como está en el navbar */}
                <div style={{
                  fontSize: 9.5, fontWeight: 800, letterSpacing: "0.08em",
                  textTransform: "uppercase", color: TEXT.muted,
                  padding: "6px 12px 3px",
                }}>
                  {sec.name}
                </div>

                {sec.rows.map((it) => {
                  const st = STATUS_STYLE[it.status];
                  return (
                    <div key={it.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 9 }}>
                      <span
                        title={st.label}
                        style={{
                          width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                          background: st.dot, boxShadow: `0 0 0 3px ${st.dot}22`,
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: PATRIA.darkBlue }}>
                          {it.label}
                        </div>
                        {/* La tabla de origen a la vista: si un número parece raro,
                            se sabe de inmediato dónde mirar. */}
                        <div style={{ fontSize: 9.5, color: TEXT.disabled, fontFamily: FONT_SECONDARY, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {it.source}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{
                          fontSize: 12, fontWeight: 800, color: st.text,
                          fontFamily: FONT_SECONDARY, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
                        }}>
                          {fmtDate(it.date)}
                        </div>
                        <div style={{ fontSize: 9.5, color: TEXT.muted, fontFamily: FONT_SECONDARY, marginTop: 1 }}>
                          {fmtAge(it.ageDays)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
          padding: "10px 18px", borderTop: `1px solid ${BORDER.subtle}`, background: "#F5F7FD",
        }}>
          <span style={{ fontSize: 10, color: TEXT.disabled, fontFamily: FONT_SECONDARY }}>
            Click anywhere or press Esc to close
          </span>
          <button
            onClick={close}
            style={{
              padding: "6px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700,
              background: PATRIA.blue, color: "#FFFFFF", border: "none", cursor: "pointer",
            }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
