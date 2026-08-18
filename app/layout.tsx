import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Navbar       from "@/components/Navbar";
import AuthProvider from "@/components/AuthProvider";

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
  icons: {
    icon:  "/icon.svg",
    apple: "/img/moneda_patria.png",
  },
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
          <main className="pt-16">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
