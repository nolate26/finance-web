"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Loader2, Database, Building2 } from "lucide-react";
import { PATRIA, FONT_PRIMARY, FONT_SECONDARY, TEXT, BORDER } from "@/lib/patriaTheme";
import TableEditor from "@/components/admin/TableEditor";
import SsV1AdminPanel from "@/components/chile/SsV1AdminPanel";
import type { PeriodoActivo } from "@/components/chile/SsV1FilasTab";

// Admin Issues: todo lo que corrige DATOS (no usuarios — eso sigue en /admin).
//   · Database Tables — editor de cualquier tabla, con empresas_industrias_v2 primero:
//     cambios de ticker, incorporaciones, homologaciones.
//   · Stock Selection (Chile) — el panel que antes iba plegado arriba de esa tabla.
// Sólo admin: la pestaña del navbar se oculta y las APIs exigen requireAdmin().

type View = "tables" | "stock-selection";

const VIEWS: { key: View; label: string; icon: typeof Database }[] = [
  { key: "tables",          label: "Database Tables",         icon: Database  },
  { key: "stock-selection", label: "Stock Selection (Chile)", icon: Building2 },
];

export default function AdminIssuesPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const isAdmin = session?.user?.role === "admin";
  const [view, setView] = useState<View>("tables");
  const [periodo, setPeriodo] = useState<PeriodoActivo | null>(null);

  useEffect(() => {
    if (status === "loading") return;
    if (!isAdmin) router.replace("/");
  }, [status, isAdmin, router]);

  // El alta de empresas del panel de Stock Selection guarda sus datos iniciales contra el
  // trimestre activo de esa vista: se pide sólo cuando se abre la pestaña.
  useEffect(() => {
    if (view !== "stock-selection" || periodo) return;
    fetch("/api/chile/stock-selection-v1")
      .then((r) => r.json())
      .then((d: { selFy?: number; selQ?: number; periodN?: string | null }) => {
        if (d.selFy && d.selQ) setPeriodo({ fy: d.selFy, q: d.selQ, label: d.periodN ?? `${d.selQ}Q ${d.selFy}` });
      })
      .catch(() => {});
  }, [view, periodo]);

  if (status === "loading" || (!isAdmin && status !== "unauthenticated")) {
    return (
      <div className="max-w-[1800px] mx-auto page-shell" style={{ display: "flex", justifyContent: "center" }}>
        <Loader2 size={20} style={{ color: PATRIA.kingBlue, animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    );
  }
  if (!isAdmin) return null;

  return (
    <div className="max-w-[1800px] mx-auto page-shell">
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      {/* Regla 1 — título principal de la vista: banda dark-blue. */}
      <div style={{ background: PATRIA.darkBlue, borderRadius: 10, padding: "14px 18px", marginBottom: 18 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: PATRIA.white, fontFamily: FONT_PRIMARY, textTransform: "uppercase", letterSpacing: "0.02em", lineHeight: 1.15, margin: 0 }}>
          Admin Issues
        </h1>
        <p style={{ fontSize: 12, marginTop: 5, color: "rgba(255,255,255,0.72)", fontFamily: FONT_SECONDARY, fontWeight: 500 }}>
          Data corrections · ticker changes, new companies, homologation · every change is logged
        </p>
      </div>

      <div className="tab-rail" style={{
        display: "inline-flex", background: "rgba(13,13,56,0.04)",
        border: `1px solid ${BORDER.base}`, borderRadius: 10, padding: 3, marginBottom: 16,
      }}>
        {VIEWS.map(({ key, label, icon: Icon }) => {
          const on = view === key;
          return (
            <button key={key} onClick={() => setView(key)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "7px 16px", fontSize: 12.5, fontWeight: on ? 700 : 600,
                color: on ? "#FFFFFF" : TEXT.label,
                background: on ? PATRIA.kingBlue : "transparent",
                border: "none", borderRadius: 8, cursor: "pointer", whiteSpace: "nowrap",
                boxShadow: on ? `0 1px 3px ${PATRIA.kingBlue}55` : "none",
              }}>
              <Icon size={13} /> {label}
            </button>
          );
        })}
      </div>

      {view === "tables" && <TableEditor />}
      {view === "stock-selection" && <SsV1AdminPanel onSourceChanged={() => {}} periodo={periodo} />}
    </div>
  );
}
