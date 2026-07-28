import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bario — Live website builder for Canadian businesses",
  description: "Design and edit your website live in the browser. Bario.ca helps you build sites and marketing assets to grow your business – no code needed. Edmonton / Vancouver.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/bario-icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/bario-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/bario-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/bario-icon-180.png", sizes: "180x180", type: "image/png" }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-CA">
      <body>{children}</body>
    </html>
  );
}
