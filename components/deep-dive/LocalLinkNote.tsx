import { PATRIA, FONT_SECONDARY } from "@/lib/patriaTheme";

// Reemplaza el botón "View Model" cuando el link guardado es una ruta del disco del
// analista (ver lib/modelLink.ts): avisa en vez de ofrecer un botón que no abre nada.
export default function LocalLinkNote({ path }: { path: string }) {
  return (
    <span
      title={`Saved link is a local file, not reachable from the web:\n${path}\n\nRe-upload the model from the SharePoint copy to fix it.`}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "2px 9px", borderRadius: 5, fontSize: 10.5, fontWeight: 700,
        fontFamily: FONT_SECONDARY,
        color: PATRIA.orange, background: "rgba(255,107,6,0.08)",
        border: "1px solid rgba(255,107,6,0.30)", cursor: "help",
      }}
    >
      Local file only — re-upload from SharePoint
    </span>
  );
}
