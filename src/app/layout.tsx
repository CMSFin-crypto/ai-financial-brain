import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import { VisitorTracker } from '@/components/financial-brain/visitor-tracker';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI Financial Brain — Sinjale Tregu me Inteligjencë Artificiale",
  description: "Shndërro lajme, politika, dhe tweets në sinjale tregu të kuptueshme. AI Financial Brain parashikon aksione, analizon kompani, dhe ofron sinjale BLEJ/MBAJ/SHIT.",
  keywords: ["AI", "financial", "stock", "market", "analysis", "trading signals", "sentiment analysis", "stock prediction"],
  authors: [{ name: "AI Financial Brain" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "AI Financial Brain",
    description: "Lajme → Sinjale Tregu → Parashikime Aksionesh",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Financial Brain",
    description: "Lajme → Sinjale Tregu → Parashikime Aksionesh",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
        suppressHydrationWarning
      >
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <VisitorTracker />
          <div suppressHydrationWarning>
            {children}
          </div>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
