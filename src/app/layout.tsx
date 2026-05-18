import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Prowider — Lead Distribution System",
  description:
    "A fair, real-time lead distribution platform for service providers.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <nav className="navbar">
          <div className="navbar-inner">
            <a href="/" className="brand">
              <span className="brand-icon">⚡</span>
              Prowider
            </a>
            <div className="nav-links">
              <a href="/request-service" className="nav-link">
                Request Service
              </a>
              <a href="/dashboard" className="nav-link">
                Dashboard
              </a>
              <a href="/test-tools" className="nav-link nav-link-accent">
                Test Tools
              </a>
            </div>
          </div>
        </nav>
        <main className="main-content">{children}</main>
      </body>
    </html>
  );
}
