import type { Metadata, Viewport } from "next";
import { Tajawal, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/flare/providers";

const tajawal = Tajawal({
  variable: "--font-tajawal",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "استوديو Flare — توليد الصور بـ GPT Image 2.5 Flare",
  description:
    "استوديو لتوليد الصور بنموذج GPT Image 2.5 Flare عبر CometAPI: توليد من نص، تحويل الرسومات إلى صور (Sketch)، خلفيات شفافة، ومعرض خاص مرتبط بمعرّفك — بدون تسجيل دخول.",
  keywords: [
    "GPT Image 2.5 Flare",
    "CometAPI",
    "توليد الصور",
    "AI image generation",
    "Sketch to image",
    "gpt-image-2.5-flare",
  ],
  authors: [{ name: "Flare Studio" }],
  icons: {
    icon:
      "data:image/svg+xml," +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbbf24"/><stop offset="0.5" stop-color="#f97316"/><stop offset="1" stop-color="#ef4444"/></linearGradient></defs><rect width="32" height="32" rx="8" fill="url(#g)"/><path d="M16 6c2.6 3.4 6.4 6.2 6.4 10.4A6.4 6.4 0 0 1 16 22.8a6.4 6.4 0 0 1-6.4-6.4C9.6 12.2 13.4 9.4 16 6z" fill="#fff"/></svg>`
      ),
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" className="dark" suppressHydrationWarning>
      <body
        className={`${tajawal.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
