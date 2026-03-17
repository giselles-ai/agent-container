"use client";

import Link from "next/link";
import { Children, isValidElement, type ReactNode } from "react";
import { Streamdown } from "streamdown";

function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^\w\s-]/g, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.trim();
}

function extractText(node: ReactNode): string {
	if (typeof node === "string" || typeof node === "number") {
		return String(node);
	}

	if (Array.isArray(node)) {
		return node.map(extractText).join("");
	}

	if (isValidElement<{ children?: ReactNode }>(node)) {
		return extractText(node.props.children);
	}

	return "";
}

export function DocsContent({ content }: { content: string }) {
	return (
		<Streamdown
			mode="static"
			components={{
				h1: ({ children }) => (
					<h1 className="text-4xl leading-[0.98] tracking-[-0.05em] text-text sm:text-6xl">
						{children}
					</h1>
				),
				h2: ({ children }) => {
					const text = extractText(children);
					return (
						<h2
							id={slugify(text)}
							className="scroll-mt-28 pt-8 text-3xl font-semibold tracking-[-0.04em] text-text sm:text-4xl"
						>
							{children}
						</h2>
					);
				},
				h3: ({ children }) => {
					const text = extractText(children);
					return (
						<h3
							id={slugify(text)}
							className="scroll-mt-28 pt-4 text-xl font-semibold tracking-[-0.03em] text-text sm:text-2xl"
						>
							{children}
						</h3>
					);
				},
				p: ({ children }) => (
					<p className="text-[15px] leading-8 text-muted sm:text-base">
						{children}
					</p>
				),
				ol: ({ children }) => (
					<ol className="space-y-3 pl-5 text-[15px] leading-8 text-muted sm:text-base">
						{children}
					</ol>
				),
				ul: ({ children }) => (
					<ul className="space-y-3 pl-5 text-[15px] leading-8 text-muted sm:text-base">
						{children}
					</ul>
				),
				strong: ({ children }) => (
					<strong className="font-semibold text-text">{children}</strong>
				),
				blockquote: ({ children }) => (
					<blockquote className="border-l border-brand/50 pl-4 text-[15px] leading-8 text-text/88 sm:text-base">
						{children}
					</blockquote>
				),
				a: ({ href, children }) => (
					<Link
						href={href ?? "#"}
						className="text-brand underline decoration-white/15 underline-offset-4 hover:text-text"
						{...(href?.startsWith("http")
							? { target: "_blank", rel: "noreferrer" }
							: {})}
					>
						{children}
					</Link>
				),
				pre: ({ children }) => (
					<pre className="panel-strong overflow-x-auto rounded-2xl px-4 py-4 text-sm text-brand">
						{children}
					</pre>
				),
				code: ({ className, children }) => {
					const childArray = Children.toArray(children);
					const isBlock =
						typeof className === "string" && className.includes("language-");

					if (isBlock) {
						return <code className={className}>{children}</code>;
					}

					return (
						<code className="rounded bg-white/6 px-1.5 py-0.5 text-[0.95em] text-brand">
							{childArray}
						</code>
					);
				},
			}}
		>
			{content}
		</Streamdown>
	);
}
