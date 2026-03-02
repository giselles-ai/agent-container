import type { Metadata } from "next";
import "./globals.css";

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
		<html lang="en">
			<body>{children}</body>
		</html>
	);
}
