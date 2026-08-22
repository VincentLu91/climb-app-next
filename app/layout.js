import { Geist, Geist_Mono } from "next/font/google";
import PostHogIdentity from "./posthog-identity";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata = {
  title: "Climb Coach — Adaptive climbing feedback",
  description: "A climbing coach that adapts to every attempt.",
};

export default function RootLayout({ children }) {
  return <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}><body className="min-h-full flex flex-col"><PostHogIdentity />{children}</body></html>;
}
