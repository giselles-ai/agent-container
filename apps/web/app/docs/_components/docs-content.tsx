"use client";

import Link from "next/link";
import {
	Children,
	isValidElement,
	type ReactNode,
	useCallback,
	useRef,
	useState,
} from "react";
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

function extractLanguage(children: ReactNode): string {
	if (isValidElement<{ className?: string }>(children)) {
		const match = children.props.className?.match(/language-(\w+)/);
		return match ? match[1] : "";
	}
	return "";
}

function CodeBlock({ children }: { children: ReactNode }) {
	const preRef = useRef<HTMLPreElement>(null);
	const [copied, setCopied] = useState(false);
	const language = extractLanguage(children);

	const handleClick = useCallback(() => {
		const text = preRef.current?.textContent ?? "";
		navigator.clipboard.writeText(text).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		});
	}, []);

	return (
		<div className="panel-strong overflow-hidden rounded-2xl">
			<div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
				<span className="text-sm text-muted/60">{language}</span>
				<button
					type="button"
					onClick={handleClick}
					aria-label="Copy code"
					className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted/40 transition-colors hover:text-text"
				>
					{copied ? (
						<svg
							aria-hidden="true"
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<polyline points="20 6 9 17 4 12" />
						</svg>
					) : (
						<svg
							aria-hidden="true"
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
							<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
						</svg>
					)}
				</button>
			</div>
			{language === "text" ? (
				<pre
					ref={preRef}
					className={`px-4 py-4 text-sm text-brand whitespace-pre-wrap break-words leading-7`}
				>
					{children}
				</pre>
			) : (
				<pre
					ref={preRef}
					className={`px-4 py-4 text-sm text-brand overflow-x-auto`}
				>
					{children}
				</pre>
			)}
		</div>
	);
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
					const id = slugify(text);
					return (
						<h2
							id={id}
							className="group/heading scroll-mt-28 pt-8 text-3xl font-semibold tracking-[-0.04em] text-text sm:text-4xl"
						>
							<a
								href={`#${id}`}
								className="flex cursor-pointer items-center gap-2"
							>
								{children}
								<svg
									aria-hidden="true"
									width="22"
									height="22"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
									className="shrink-0 text-text opacity-0 transition-opacity group-hover/heading:opacity-100"
								>
									<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
									<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
								</svg>
							</a>
						</h2>
					);
				},
				h3: ({ children }) => {
					const text = extractText(children);
					const id = slugify(text);
					return (
						<h3
							id={id}
							className="group/heading scroll-mt-28 pt-4 text-xl font-semibold tracking-[-0.03em] text-text sm:text-2xl"
						>
							<a
								href={`#${id}`}
								className="flex cursor-pointer items-center gap-2"
							>
								{children}
								<svg
									aria-hidden="true"
									width="18"
									height="18"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
									className="shrink-0 text-text opacity-0 transition-opacity group-hover/heading:opacity-100"
								>
									<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
									<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
								</svg>
							</a>
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
				pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
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
