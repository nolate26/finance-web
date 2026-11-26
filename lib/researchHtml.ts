/**
 * Normaliza el HTML de una nota de research (email de Outlook/Word) antes de
 * inyectarlo con dangerouslySetInnerHTML.
 *
 * Los correos llegan como documentos completos (<html><head><style>…). Al pasarlos
 * por innerHTML el navegador descarta <html>/<head>/<body> pero SÍ aplica el <style>
 * de Word, y ese bloque trae selectores de elemento (ol, ul, p.MsoNormal…) que se
 * filtran al resto de la página. Nos quedamos solo con el contenido del <body> y
 * dejamos que `.research-html` (globals.css) ponga la tipografía y las viñetas.
 */
export function prepareResearchHtml(raw: string | null | undefined): string {
  if (!raw) return "";

  // SSR / entorno sin DOM: limpieza mínima por regex.
  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    return raw
      .replace(/<(style|script|title)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
      .replace(/<\/?(?:html|head|body|meta|link)\b[^>]*>/gi, "")
      .replace(/<img\b[^>]*\bsrc\s*=\s*["']cid:[^>]*>/gi, "");
  }

  try {
    const doc = new DOMParser().parseFromString(raw, "text/html");
    doc.querySelectorAll("style, script, title, meta, link, base").forEach((el) => el.remove());
    doc.querySelectorAll("img").forEach((img) => {
      // `cid:` = imagen del correo que nunca se subió (notas anteriores a la ingesta de
      // imágenes, o una que falló): se quita en vez de mostrar un ícono roto.
      if (/^cid:/i.test(img.getAttribute("src") ?? "")) { img.remove(); return; }
      img.setAttribute("loading", "lazy");
    });
    return doc.body?.innerHTML ?? raw;
  } catch {
    return raw;
  }
}
