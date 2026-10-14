import type { Metadata, Viewport } from "next";
import { Inter, Sora } from "next/font/google";

import { siteConfig } from "@/config/site";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
  display: "swap",
  weight: ["600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: `${siteConfig.name} | Laundry Pickup and Delivery`,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  keywords: [
    "laundry",
    "laundry pickup and delivery",
    "dry cleaning",
    "shoe cleaning",
    "curtain cleaning",
    "UClean",
  ],
  openGraph: {
    type: "website",
    url: siteConfig.url,
    siteName: siteConfig.name,
    title: `${siteConfig.name} | Laundry Pickup and Delivery`,
    description: siteConfig.description,
    locale: "en_IN",
  },
  twitter: {
    card: "summary_large_image",
    title: `${siteConfig.name} | Laundry Pickup and Delivery`,
    description: siteConfig.description,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#a3e635",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/*
        Browser extensions with a `cz` prefix (colour pickers and the like)
        inject cz-shortcut-listen onto <body> from a content script that runs
        before React hydrates, which React reports as a hydration mismatch.

        The scope of this escape hatch is only <body>'s own attributes and its
        direct text children, so a real mismatch deeper in the tree is still
        reported. It does not paper over hydration bugs generally.

        Disabling the extension removes the need for this.
      */}
      <body
        suppressHydrationWarning
        className={`${inter.variable} ${sora.variable} bg-background text-foreground font-sans antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
