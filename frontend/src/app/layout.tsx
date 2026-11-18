import type { Metadata } from "next"
import { Inter } from "next/font/google"
import { DEFAULT_LANGUAGE } from "@lumi/shared-contracts/language"

import { cn } from "@/lib/utils"

import "./globals.css"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  // The chat pages set their own, naming the installation's assistant and business
  title: "Lumi",
  description: "AI sales assistant",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // Static, so the pages can be prerendered. The chat pages mark their content with their own language and set the attribute
  // to it in the browser (see LanguageProvider); other pages, e.g. admin ones, are in English
  return (
    <html lang={DEFAULT_LANGUAGE}>
      <body className={cn(inter.className, "bg-slate-200")}>{children}</body>
    </html>
  )
}
