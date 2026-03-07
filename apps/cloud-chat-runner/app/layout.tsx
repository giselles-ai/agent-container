import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Cloud Chat Runner",
	description: "Local API app for runCloudChat and agent snapshot builds.",
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
