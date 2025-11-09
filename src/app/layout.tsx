import type { Metadata } from "next"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import { Analytics } from "@vercel/analytics/next"
import "../styles/globals.css"
import { AppShell } from "@/components/app-shell"

export const metadata: Metadata = {
  title: "MetaGPT X",
  icons: {
    icon: "/metagpt-favicon.svg",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className={`font-sans antialiased`}>
        <AppShell>{children}</AppShell>
        <Analytics />
      </body>
    </html>
  )
}
