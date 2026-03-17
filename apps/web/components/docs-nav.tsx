"use client";

import { useEffect, useRef, useState } from "react";

export type TocEntry = {
	id: string;
	text: string;
	level: number;
};

export function DocsNav({ entries }: { entries: TocEntry[] }) {
	const [activeId, setActiveId] = useState<string>("");
	const observerRef = useRef<IntersectionObserver | null>(null);

	useEffect(() => {
		const headings = entries
			.map((entry) => document.getElementById(entry.id))
			.filter(Boolean) as HTMLElement[];

		if (headings.length === 0) return;

		observerRef.current = new IntersectionObserver(
			(intersections) => {
				for (const entry of intersections) {
					if (entry.isIntersecting) {
						setActiveId(entry.target.id);
						break;
					}
				}
			},
			{ rootMargin: "-96px 0px -65% 0px", threshold: 0 },
		);

		for (const heading of headings) {
			observerRef.current.observe(heading);
		}

		return () => observerRef.current?.disconnect();
	}, [entries]);

	return (
		<nav
			className="sticky top-28 max-h-[calc(100vh-8rem)] overflow-y-auto pr-4"
			aria-label="Documentation navigation"
		>
			<p className="font-mono text-[11px] uppercase tracking-[0.34em] text-muted">
				On this page
			</p>
			<ul className="mt-5 space-y-1 text-sm">
				{entries.map((entry) => {
					const isActive = activeId === entry.id;
					return (
						<li key={entry.id}>
							<a
								href={`#${entry.id}`}
								className={[
									"block rounded-lg py-1.5 transition",
									entry.level === 3 ? "pl-4 text-[13px]" : "pl-0 text-sm",
									isActive ? "text-text" : "text-muted hover:text-text",
								].join(" ")}
							>
								{entry.text}
							</a>
						</li>
					);
				})}
			</ul>
		</nav>
	);
}
