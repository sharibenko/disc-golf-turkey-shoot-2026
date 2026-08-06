import type { Metadata } from "next";
import "./globals.css";
import "./divisions.css";
import "./reset.css";
import "./export.css";

export const metadata: Metadata = { title: "Disc Golf Turkey Shoot", description: "Live signup, scoring, and leaderboard for the Disc Golf Turkey Shoot." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
