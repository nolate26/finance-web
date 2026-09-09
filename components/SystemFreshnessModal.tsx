"use client";

import FreshnessModal from "./FreshnessModal";

// Modal global: se abre al entrar a la plataforma. Va en el layout raíz, así que no
// se remonta al navegar con el router — sólo en una carga completa de página.
//
// `blocking` porque es el que manda: si al mismo tiempo se está entrando a Stock
// Selection, esa alerta espera a que ésta se cierre en vez de apilarse encima.
export default function SystemFreshnessModal() {
  return (
    <FreshnessModal
      scope="global"
      title="System Freshness"
      subtitle="Last update of the platform's data"
      storageKey="patria:freshness-seen"
      blocking
    />
  );
}
