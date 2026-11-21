import type { Metadata, Viewport } from "next";
import { Hind, Instrument_Serif } from "next/font/google";
import "./globals.css";

// Visual language follows SuperProfile's own site: a Hind-family sans for text
// with Instrument Serif italics for emphasis. We use "Hind" (not Hind Madurai)
// because it includes Devanagari, so Hindi and Hinglish stores render properly.
const hind = Hind({
  variable: "--font-hind",
  subsets: ["latin", "devanagari"],
  weight: ["400", "500", "600", "700"],
});
const serif = Instrument_Serif({
  variable: "--font-instrument",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Minute Store · Turn your Instagram into a store",
  description:
    "Turn your Instagram handle or a one-line description into a ready-to-share store with products, INR pricing and copy.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f0a19",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${hind.variable} ${serif.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
