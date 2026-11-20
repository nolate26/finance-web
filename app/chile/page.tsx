"use client";

import { Fragment, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import TabSpacer from "@/components/TabSpacer";
import ActiveDecisions from "@/components/chile/ActiveDecisions";
import StockSelectionV1 from "@/components/chile/StockSelectionV1";
import LastFicha from "@/components/chile/LastFicha";

// Top Picks salió de acá: vive en Analyst Estimates como "Top Picks Chile".
// Projections se eliminó (2026-11-18): las proyecciones salen de los modelos del analista.
type ActiveTab = "stock-selection" | "last-ficha" | "active-decisions";

// `spacerBefore` abre un separador antes de la pestaña: agrupa Stock Selection y
// Last Ficha a la izquierda y despega Multiples Range del bloque principal.
const TABS: { key: ActiveTab; label: string; spacerBefore?: boolean }[] = [
  { key: "stock-selection",  label: "Stock Selection" },
  { key: "last-ficha",       label: "Last Ficha"      },
  { key: "active-decisions", label: "Multiples Range", spacerBefore: true },
];
const isTab = (t: string | null): t is ActiveTab => TABS.some((x) => x.key === t);

// useSearchParams necesita un Suspense alrededor (Next 15).
export default function ChilePage() {
  return (
    <Suspense fallback={null}>
      <ChilePageContent />
    </Suspense>
  );
}

function ChilePageContent() {
  // Deep link: /chile?tab=last-ficha&ticker=ANDINAB%20CI%20EQUITY (mini botón de Stock
  // Selection). Se re-lee en cada navegación: el link apunta a esta misma página.
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tickerParam = searchParams.get("ticker");
  const [activeTab, setActiveTab] = useState<ActiveTab>(isTab(tabParam) ? tabParam : "stock-selection");
  useEffect(() => { if (isTab(tabParam)) setActiveTab(tabParam); }, [tabParam, tickerParam]);

  return (
    <div className="max-w-[1600px] mx-auto page-shell">
      {/* Page header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0D0D38", letterSpacing: "-0.035em", lineHeight: 1.15, margin: 0 }}>
            Chile Equities
          </h1>
          <p style={{ fontSize: 12, marginTop: 5, color: "rgba(13,13,56,0.62)", fontWeight: 500, letterSpacing: "0.01em" }}>
            Chilean equity universe · AGF coverage
          </p>
        </div>
      </div>

      {/* Sub-navigation tabs */}
      <div
        className="tab-rail flex items-center mb-5"
        style={{
          gap: 2, padding: "3px", borderRadius: 10,
          background: "rgba(13,13,56,0.04)",
          border: "1px solid rgba(13,13,56,0.08)",
          width: "fit-content",
        }}
      >
        {TABS.map(({ key: tab, label, spacerBefore }) => {
          const active = activeTab === tab;
          return (
            <Fragment key={tab}>
              {spacerBefore && <TabSpacer />}
            <button
              onClick={() => setActiveTab(tab)}
              className="px-5 py-1.5 rounded-lg text-sm transition-all"
              style={{
                background: active ? "#FFFFFF"  : "transparent",
                color:      active ? "#0D0D38"  : "rgba(13,13,56,0.62)",
                border:     active ? "1px solid rgba(13,13,56,0.11)" : "1px solid transparent",
                boxShadow:  active ? "0 1px 3px rgba(13,13,56,0.09)" : "none",
                fontWeight: active ? 700 : 500,
                cursor: "pointer",
              }}
            >
              {label}
            </button>
            </Fragment>
          );
        })}
      </div>

      {/* ── Stock Selection ─────────────────────────────────────────────────── */}
      {activeTab === "stock-selection" && <StockSelectionV1 />}

      {/* ── Last Ficha ──────────────────────────────────────────────────────── */}
      {/* key: un link nuevo a otra compañía vuelve a montar la vista en esa compañía. */}
      {activeTab === "last-ficha" && <LastFicha key={tickerParam ?? ""} initialTicker={tabParam === "last-ficha" ? tickerParam : null} />}

      {/* ── Active Decisions ────────────────────────────────────────────────── */}
      {activeTab === "active-decisions" && <ActiveDecisions />}
    </div>
  );
}
