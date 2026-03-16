import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
	title: "Giselle for Vercel",
	description:
		"Build OpenClaw-like agent experiences on Vercel with Next.js, the AI SDK, and Vercel Sandbox.",
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
