import "./globals.css";
import type { ReactNode } from "react";

export const metadata = { title: "Bancada PRISMA", description: "Protocolo, busca, triagem e extração para revisões sistemáticas" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
