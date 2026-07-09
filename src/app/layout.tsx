import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Leadway Health | Provider Tariff Negotiation",
  description: "Track provider tariff negotiations, delays, and member notifications.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans text-ink-900 antialiased">{children}</body>
    </html>
  );
}
