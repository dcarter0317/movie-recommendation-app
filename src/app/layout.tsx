import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Fraunces, Geist } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";

// Geist Sans is the interface and body family, exposed as `--font-sans`
// (the `font-sans` utility and shadcn's `@theme` mapping both read it).
const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

// Fraunces is the display serif, exposed as `--font-display` (the
// `font-display` utility). Used only at `text-3xl` and larger. Variable
// weight, no extra axes.
const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
  axes: [],
});

export const metadata: Metadata = {
  title: {
    default: "Reel",
    template: "%s · Reel",
  },
  description:
    "Teach Reel your taste in film and get a personalized feed that explains every pick.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${fraunces.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider>
          {children}
          <Toaster position="top-center" richColors={false} />
        </ThemeProvider>
      </body>
    </html>
  );
}
