import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";

// Geist Sans is the one family for everything, exposed as `--font-sans`
// (the `font-sans` utility and shadcn's `@theme` mapping both read it).
// There is no separate display face: `--font-display` is an alias of
// `--font-sans` in `globals.css`, and headings carry hierarchy through
// weight (`font-semibold`) and tracking (`tracking-tight`).
const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
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
    <html lang="en" className={`${geistSans.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="flex min-h-full flex-col">
        <ThemeProvider>
          {children}
          <Toaster position="top-center" richColors={false} />
        </ThemeProvider>
      </body>
    </html>
  );
}
