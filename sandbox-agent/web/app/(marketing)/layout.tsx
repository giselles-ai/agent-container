import { DM_Sans, Instrument_Serif } from "next/font/google";

const serif = Instrument_Serif({
	weight: "400",
	subsets: ["latin"],
	variable: "--font-serif",
});

const sans = DM_Sans({
	subsets: ["latin"],
	variable: "--font-sans",
});

export default function MarketingLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<div
			className={`${serif.variable} ${sans.variable} bg-ground font-[family-name:var(--font-sans)] text-soil antialiased`}
		>
			{children}
		</div>
	);
}
