import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";

import "./globals.css";
import { Providers } from "./providers";
import { CreditBar } from "@/components/CreditBar";
import { Shell } from "@/components/Shell";

// Self-hosted (SIL OFL 1.1, licences beside the files): a build never reaches out to a font host.
const atkinson = localFont({
  src: [
    { path: "./fonts/atkinson-next.woff2", style: "normal", weight: "200 800" },
    { path: "./fonts/atkinson-next-italic.woff2", style: "italic", weight: "200 800" },
  ],
  variable: "--font-atkinson",
  display: "swap",
});

const atkinsonMono = localFont({
  src: "./fonts/atkinson-mono.woff2",
  weight: "200 800",
  variable: "--font-atkinson-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "KeyWitness", template: "%s | KeyWitness" },
  description:
    "Every property claim deserves evidence. Agree the criteria, file the evidence, and get a traceable assessment " +
    "from GenLayer validators, with uncertainty and challenges handled explicitly.",
  applicationName: "KeyWitness",
};

export const viewport: Viewport = { themeColor: "#0e1a2b" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${atkinson.variable} ${atkinsonMono.variable}`}>
      <body>
        <Providers>
          <Shell>
            <CreditBar />
            {children}
          </Shell>
        </Providers>
      </body>
    </html>
  );
}
