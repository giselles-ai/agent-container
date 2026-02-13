import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
	title: "AI RPA SDK Demo",
	description: "Prototype for AI-driven form automation in a Next.js app",
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
