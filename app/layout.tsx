import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rate My Face",
  description: "Product recommendation backend for the Rate My Face GPT."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
