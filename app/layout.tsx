import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";

export const metadata: Metadata = {
  title: "Research Hub",
  description: "Plataforma centralizada de análisis de inversiones",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="min-h-screen grid-bg">
        <Navbar />
        <main className="pt-16">{children}</main>
      </body>
    </html>
  );
}
