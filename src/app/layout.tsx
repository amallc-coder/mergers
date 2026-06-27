import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "clinilytics M&A — Healthcare Diligence Platform",
  description:
    "clinilytics M&A: turnkey diligence operating system for healthcare practice acquisitions — data rooms, diligence tracking, AI extraction, and executive dashboards.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
