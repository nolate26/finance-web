/**
 * consensus_estimates se ingiere en escalas inconsistentes por ticker: para algunos el
 * consenso queda ~1000× la escala del modelo ("Moneda"), para otros ya en escala del modelo.
 * Dadas muestras alineadas modelo/consenso, devuelve el factor potencia-de-1000 `f` tal que
 * `consensusRaw / f` cae en la escala del modelo. Usa la primera pareja válida (ambos no nulos
 * y ≠ 0). Devuelve `fallback` cuando no hay ninguna pareja usable.
 *
 * El boundary de redondeo está en ratio ≈ 31.6× (√1000), muy lejos de los ratios reales
 * (~1 o ~1000), así que la detección es robusta. Se usa `Math.abs` para soportar valores
 * negativos (p. ej. Net Income negativo).
 */
export function consensusScaleFactor(
  model: (number | null)[],
  consensus: (number | null)[],
  fallback = 1,
): number {
  for (let i = 0; i < model.length; i++) {
    const m = model[i];
    const c = consensus[i];
    if (m != null && c != null && m !== 0 && c !== 0) {
      const exp = Math.round(Math.log(Math.abs(c / m)) / Math.log(1000));
      return Math.pow(1000, exp);
    }
  }
  return fallback;
}
