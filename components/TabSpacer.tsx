"use client";

/**
 * Separador entre grupos de pestañas dentro de una misma píldora.
 *
 * POR QUÉ NO ES `ml-auto` NI `flex-grow`: las barras de pestañas de la plataforma
 * son contenedores con `width: fit-content`, o sea que miden exactamente lo que
 * miden sus botones. En un flex sin espacio libre, `margin-left: auto` y
 * `flex-grow: 1` no tienen nada que repartir y no hacen absolutamente nada. Para
 * que empujaran de verdad habría que estirar la píldora al ancho completo del
 * contenido, y en un monitor ancho eso deja una barra de 1500px con tres botones
 * pegados a un borde y uno al otro.
 *
 * Un ancho fijo más una línea sutil separa los grupos igual de claro, mantiene la
 * píldora del porte de su contenido y no se rompe al angostar la ventana: el
 * separador simplemente viaja con los botones cuando el contenedor hace wrap.
 */
export default function TabSpacer() {
  return (
    <span
      aria-hidden
      style={{
        width: 1,
        alignSelf: "stretch",
        flexShrink: 0,
        margin: "4px 10px",
        background: "rgba(13,13,56,0.14)",
        borderRadius: 1,
      }}
    />
  );
}
