import type { Metadata, Viewport } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Navbar       from "@/components/Navbar";
import AuthProvider from "@/components/AuthProvider";
import SystemFreshnessModal from "@/components/SystemFreshnessModal";
import FitTablesLandscape   from "@/components/FitTablesLandscape";

// Aptos (títulos) y Arial (todo lo demás) son fuentes de sistema: se declaran en
// globals.css como --font-primary / --font-secondary, no vía next/font.
// JetBrains Mono se mantiene solo para los pills monoespaciados de fuente/dato.
const jetbrainsMono = JetBrains_Mono({
  subsets:  ["latin"],
  variable: "--font-mono",
  weight:   ["400", "500"],
  display:  "swap",
});

export const metadata: Metadata = {
  title: "Research Hub",
  description: "Investment research platform — Chile & LatAm equities",
  // Íconos de "Add to Home Screen". El apple-touch-icon tiene que ser un PNG
  // cuadrado con fondo sólido: iOS no respeta transparencias (las compone sobre
  // negro) y si la imagen no es cuadrada la estira. Antes apuntaba al wordmark
  // horizontal (914×244, transparente) → salía como un pantallazo recortado.
  // Los PNG se generan desde public/img/moneda_patria.png (wordmark en blanco
  // sobre #0D0D38, el themeColor).
  icons: {
    icon:  "/icon.svg",
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    title: "Research Hub",
    statusBarStyle: "black-translucent",
  },
};

/**
 * La plataforma se lee en tablet y teléfono, y buena parte del contenido son
 * tablas de 20+ columnas que NO se pueden reflowear sin perder la comparación
 * lado a lado. Así que el zoom del navegador es parte de la herramienta, no un
 * accidente: `maximumScale: 5` + `userScalable` dejan hacer pinch para leer una
 * celda y volver. Nunca poner `maximum-scale: 1` acá.
 *
 * `viewportFit: "cover"` pinta bajo el notch; los insets se recuperan en
 * globals.css con env(safe-area-inset-*).
 */
export const viewport: Viewport = {
  width:        "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit:  "cover",
  themeColor:   "#0D0D38",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={jetbrainsMono.variable}>
      <body className="min-h-screen grid-bg">
        <AuthProvider>
          <Navbar />
          {/* pt-16 = los 64px del navbar fijo. El valor está también en
              StockSelectionV1 como NAV_H, porque su encabezado sticky se pega
              justo debajo: si acá cambia, allá también. */}
          <main className="pt-16">{children}</main>
          {/* Va en el layout raíz a propósito: así NO se vuelve a montar en cada
              navegación del router, sólo en una carga completa de página. */}
          <SystemFreshnessModal />
          {/* Encoge las tablas anchas para que entren completas en táctil
              horizontal. No renderiza nada; vive acá para cubrir toda ruta. */}
          <FitTablesLandscape />
        </AuthProvider>
      </body>
    </html>
  );
}
