import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "TrickOrTrack · Siga os doces",
  description:
    "O mapa de doçuras e travessuras do seu bairro. Encontre as casas participantes e acompanhe onde ainda tem doces.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
