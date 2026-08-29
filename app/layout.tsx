import type { Metadata } from "next";
import Script from "next/script";
import GlobalMenuButton from "@/components/GlobalMenuButton";
import "./globals.css";

// Bario defaults to dark (matches the brand everywhere today). <html> is
// rendered with the `dark` class server-side so first paint always matches
// that with zero flash. This tiny blocking script only needs to strip the
// class for a returning visitor who explicitly chose light mode via
// ThemeToggle, before the browser paints anything.
const THEME_INIT_SCRIPT = `try{if(localStorage.getItem('bario-theme')==='light'){document.documentElement.classList.remove('dark')}}catch(e){}`;

const DEFAULT_TITLE = "Bario — Cloud Hosting Built for Speed. Powered by AI.";
const DEFAULT_DESCRIPTION =
  "Design and edit your website live in the browser, or deploy a Bario Cloud VPS server in minutes. Hosting, an AI website builder, and cloud servers for Canadian businesses – no code needed.";

export const metadata: Metadata = {
  title: DEFAULT_TITLE,
  description: DEFAULT_DESCRIPTION,
  metadataBase: new URL("https://bario.ca"),
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/bario-icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/bario-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/bario-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/bario-icon-180.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    siteName: "Bario",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-CA" className="dark" suppressHydrationWarning>
      <head>
        <Script id="theme-init" strategy="beforeInteractive">{THEME_INIT_SCRIPT}</Script>
      </head>
      <body>
        {children}
        <GlobalMenuButton />
      </body>
    </html>
  );
}
