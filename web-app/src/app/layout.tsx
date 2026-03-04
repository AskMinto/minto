import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import { AuthProvider } from "@/providers/auth-provider";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-dm-sans",
});

export const metadata: Metadata = {
  title: "Minto — Portfolio Assistant",
  description:
    "AI-powered portfolio assistant for Indian retail investors. Track holdings, get market insights, and chat with Minto.",
  icons: { icon: "/minto.png" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={dmSans.variable}>
      <body className="font-[family-name:var(--font-dm-sans)] antialiased min-h-screen">
        <div className="animated-gradient-bg" />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
