import type { Metadata } from "next";
import { Geist, Tomorrow } from "next/font/google";
import "./globals.css";

const geist = Geist({
	subsets: ["latin"],
});

const tomorrow = Tomorrow({
	weight: ["400", "600"],
	subsets: ["latin"],
	variable: "--font-tomorrow",
});

export const metadata: Metadata = {
	title: "Giselle Agent SDK — AI agents that act, not just talk",
	description:
		"Bring CLI agent superpowers into your Next.js app through the AI SDK you already use. Open source.",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" className={`${geist.className} ${tomorrow.variable}`}>
			<body>{children}</body>
		</html>
	);
}
