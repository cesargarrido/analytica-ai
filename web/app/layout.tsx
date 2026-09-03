import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Analytica AI - Detección de patrones en datos",
  description:
    "Sube tu CSV y descubre tendencias, outliers, correlaciones y anomalías con análisis automático.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
