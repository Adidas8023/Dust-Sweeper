import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dust Sweeper",
  description: "One click. All dust. One USDC. Any chain you want.",
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
    apple: "/apple-icon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
