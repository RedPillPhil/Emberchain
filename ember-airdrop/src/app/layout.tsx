import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ember Airdrop — Earn EMBR Before Liquidity",
  description:
    "Complete verified tasks, grow the Emberchain network, and earn EMBR from a 100k pool. Liquidity added November 1st.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
        <Toaster theme="dark" richColors position="top-center" />
      </body>
    </html>
  );
}
