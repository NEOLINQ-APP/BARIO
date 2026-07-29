import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

// Bario defaults to dark (matches the brand everywhere today). <html> is
// rendered with the `dark` class server-side so first paint always matches
// that with zero flash. This tiny blocking script only needs to strip the
// class for a returning visitor who explicitly chose light mode via
// ThemeToggle, before the browser paints anything.
const THEME_INIT_SCRIPT = `try{if(localStorage.getItem('bario-theme')==='light'){document.documentElement.classList.remove('dark')}}catch(e){}`;

export const metadata: Metadata = {
  title: "Bario — Live website builder for Canadian businesses",
  description: "Design and edit your website live in the browser. Bario.ca helps you build sites and marketing assets to grow your business – no code needed.",
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
    <html lang="en-CA" className="dark">
      <head>
        <Script id="theme-init" strategy="beforeInteractive">{THEME_INIT_SCRIPT}</Script>
      </head>
      <body>{children}</body>
    </html>
  );
}
