import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bario — Live website builder for Canadian businesses",
  description: "Design and edit your website live in the browser. Bario.ca helps you build sites and marketing assets to grow your business – no code needed. Edmonton / Vancouver.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-CA">
      <body>{children}</body>
    </html>
  );
}
