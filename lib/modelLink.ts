// Link "View Model" de model_headers / bank_headers.
//
// La macro de Excel guarda la ruta del libro tal como la ve el analista. Si el libro
// está abierto desde SharePoint queda una URL https usable por todos; si está abierto
// desde una copia local queda una ruta de su disco ("C:\Users\…\Banco%20BCI.xlsm"),
// que el navegador no puede abrir y nadie más tiene. Pasó con BBDC4, ITUB4 y PINE4
// (las tres apuntando además al libro de BCI). Sólo se ofrece el botón con URLs web.

/** La URL si es http(s); null si es una ruta local o viene vacía. */
export function webModelLink(link: string | null | undefined): string | null {
  const t = link?.trim();
  return t && /^https?:\/\//i.test(t) ? t : null;
}

/** true si hay un link guardado pero no es web (ruta local del analista). */
export function isLocalModelLink(link: string | null | undefined): boolean {
  return !!link?.trim() && !webModelLink(link);
}
