import type { Metadata } from "next";
import { Inter, JetBrains_Mono, IBM_Plex_Sans_Arabic } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme/theme-provider";

const inter = Inter({
  variable: "--font-sans",
  // "cyrillic" adds Russian glyph coverage for pt/ru guest rooms.
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

// Arabic face for RTL guest rooms — Inter has no Arabic glyphs. Applied via a
// `[lang="ar"]` rule in globals.css so only Arabic rooms use it.
const plexArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-arabic",
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "AGB Technologies",
  description:
    "Enterprise chief-of-staff platform for the AGB portfolio.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${jetbrainsMono.variable} ${plexArabic.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
