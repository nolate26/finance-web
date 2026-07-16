import type { Metadata } from "next";
import { Figtree, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Navbar       from "@/components/Navbar";
import AuthProvider from "@/components/AuthProvider";

const figtree = Figtree({
  subsets:  ["latin"],
  variable: "--font-sans",
  weight:   ["400", "500", "600", "700", "800"],
  display:  "swap",
});

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
    <html lang="es" className={`${figtree.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen grid-bg">
        <AuthProvider>
          <Navbar />
          <main className="pt-16">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
