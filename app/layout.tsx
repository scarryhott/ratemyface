import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rate My Face",
  description: "Your Rate My Face account for credits, personal history, comparisons, and appearance plans."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
