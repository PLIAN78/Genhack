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

import SuppressMediaPipeLogs from "../components/SuppressMediaPipeLogs";

export const metadata: Metadata = {
  title: "Security Copilot — Digital Polygraph",
  description: "Real-time forensic behavioral analysis for in-branch fraud detection.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <SuppressMediaPipeLogs />
        {children}
      </body>
    </html>
  );
}
