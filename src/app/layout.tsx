import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Среда",
    template: "%s · Среда",
  },
  description:
    "Среда — простые готовые инструменты для малого бизнеса в Telegram и ВКонтакте.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className={`${manrope.variable} h-full antialiased`}>
      <body className="min-h-full bg-[var(--background)] font-sans text-[var(--text-primary)]">
        {children}
      </body>
    </html>
  );
}
