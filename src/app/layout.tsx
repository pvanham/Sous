import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";

import { Providers } from "@/components/shared/providers";

import "./globals.css";

export const metadata: Metadata = {
  title: "Sous",
  description: "AI-assisted kitchen scheduling platform.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <body>
          <Providers>{children}</Providers>
        </body>
      </html>
    </ClerkProvider>
  );
}
