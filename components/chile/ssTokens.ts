// Tokens compartidos entre la tabla de Stock Selection y su hoja imprimible.
//
// Viven aparte para que SsV1PrintView no tenga que importar valores desde
// StockSelectionV1 (que a su vez importa la vista): el ciclo funcionaría, pero es el tipo
// de cosa que un día rompe en silencio. Lo que está acá tiene que verse IGUAL en
// pantalla y en papel — es la garantía de que el PDF es la tabla y no una versión.

/** Naranja de una celda con valor editado a mano (override de admin). */
export const EDIT_BG = "rgba(255,107,6,0.30)";
export const EDIT_BORDER = "#FF6B06";

/** Divisoria vertical entre grupos de columnas. */
export const GROUP_RULE = "rgba(13,13,56,0.22)";
/** Divisoria horizontal entre secciones del orden por sector. */
export const SECTION_RULE = "rgba(13,13,56,0.30)";
