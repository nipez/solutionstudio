import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Service AI — After-hours booking",
  description:
    "First working slice: after-hours voice booking for trades. Simulated call UI + office job board.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@500;600;700&family=Source+Sans+3:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div className="app-shell">
          <header className="topnav">
            <div className="brand">
              <strong>Service AI</strong>
              <span>After-hours booking · Summit Comfort HVAC demo</span>
            </div>
            <nav className="nav-links">
              <Link href="/">Simulated call</Link>
              <Link href="/office">Office</Link>
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
