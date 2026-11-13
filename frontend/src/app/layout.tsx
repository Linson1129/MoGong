import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MoGong",
  description:
    "Visual intent compiler: draw a layout as rectangles, compile it into JSON an agent can build from.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // zh-CN, not en: the interface copy is Chinese (docs/spec.md section 9), and the document
    // language is what tells the text engine how to segment and hyphenate CJK runs.
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* Overflow hidden is deliberate: the editor owns the whole window, and a stray scroll bar
          appearing because a panel grew would shift the canvas and make drawn coordinates disagree
          with what the user sees. */}
      <body className="flex h-full min-h-full flex-col overflow-hidden">{children}</body>
    </html>
  );
}
