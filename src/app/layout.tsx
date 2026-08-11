import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import "./globals.css";
const inter = Inter({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-inter",
});


export const metadata: Metadata = {
  title: {
    default: "Minhas Finanças",
    template: "%s | Minhas Finanças",
  },
  description: "Controle financeiro pessoal compartilhado.",
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f4f7fb",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html className={inter.variable} lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
