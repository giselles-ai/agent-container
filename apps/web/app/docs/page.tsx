import fs from "node:fs";
import path from "node:path";
import Image from "next/image";
import Link from "next/link";
import { DocsNav, type TocEntry } from "@/components/docs-nav";
import { DocsContent } from "./_components/docs-content";

function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^\w\s-]/g, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.trim();
}

function extractToc(markdown: string): TocEntry[] {
	const entries: TocEntry[] = [];

	for (const match of markdown.matchAll(/^(#{2,3})\s+(.+)$/gm)) {
		entries.push({
			id: slugify(match[2].trim()),
			text: match[2].trim(),
			level: match[1].length,
		});
	}

	return entries;
}

export default function DocsPage() {
	const markdownPath = path.join(process.cwd(), "app/docs/docs.md");
	const content = fs.readFileSync(markdownPath, "utf-8");
	const toc = extractToc(content);

	return (
		<main className="min-h-screen px-5 pb-20 sm:px-8 sm:pb-24">
			<div className="mx-auto max-w-7xl">
				<header className="sticky top-0 z-20 border-b border-white/10 bg-bg/80 backdrop-blur">
					<div className="flex min-h-20 items-center justify-between gap-4">
						<Link href="/" className="flex items-end gap-2.5">
							<Image
								src="/giselle-logo.svg"
								alt="giselle"
								width={68}
								height={28}
								className="h-auto w-[68px]"
								priority
							/>
							<p className="relative top-[-2px] text-[21px] font-semibold tracking-[-0.01em] text-text">
								Sandbox Agent
							</p>
						</Link>
						<nav className="hidden items-center gap-5 text-sm text-muted md:flex">
							<Link href="/">Home</Link>
							<Link
								href="https://github.com/giselles-ai/agent-container"
								target="_blank"
								rel="noreferrer"
							>
								GitHub
							</Link>
						</nav>
					</div>
				</header>

				<div className="mt-10 flex gap-12 lg:mt-14 lg:gap-16">
					<aside className="hidden w-56 shrink-0 lg:block">
						<DocsNav entries={toc} />
					</aside>

					<article className="streamdown min-w-0 max-w-3xl flex-1">
						<DocsContent content={content} />
					</article>
				</div>
			</div>
		</main>
	);
}
