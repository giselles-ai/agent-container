import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
	title: "Workspace Report Demo",
	description:
		"Seed a sandbox workspace with files and ask an agent to turn them into report artifacts.",
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
