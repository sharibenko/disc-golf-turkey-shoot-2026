import type { Metadata } from "next";
import "./globals.css";
import "./divisions.css";
import "./reset.css";
import "./export.css";

export const metadata: Metadata = { title: "Turkey Target Challenge 2026", description: "Live signup, scoring, and leaderboard for the Turkey Target Challenge 2026." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
