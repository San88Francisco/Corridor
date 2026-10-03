import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
  title: {
    default: "Коридор — гра для двох",
    template: "%s · Коридор",
  },
  description:
    "Стратегічна гра для двох: дійдіть до протилежного краю дошки раніше за суперника.",
};

// Колір панелі мобільного браузера збігається з шапкою.
export const viewport: Viewport = {
  themeColor: "#070d1a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="uk" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-ink-50 text-ink-900">{children}</body>
    </html>
  );
}
