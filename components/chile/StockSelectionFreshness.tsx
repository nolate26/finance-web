"use client";

import FreshnessModal from "@/components/FreshnessModal";

// Alerta propia de Chile → Stock Selection.
//
// Existe aparte del modal global porque esta vista NO se alimenta del lote de mercado
// del resto de la plataforma: sus precios y retornos vienen del snapshot diario de
// Bloomberg (ticker_return_snapshot) y sus proyecciones del Excel del analista
// (proyecciones_financieras). Mezclar esas dos fechas en el modal global daba a
// entender que aplicaban a toda la app, y no es así.
export default function StockSelectionFreshness() {
  return (
    <FreshnessModal
      scope="stock-selection"
      title="Stock Selection — data freshness"
      subtitle="Last update of the data feeding this view"
      storageKey="patria:freshness-seen:ss"
    />
  );
}
