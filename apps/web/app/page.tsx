import Link from "next/link";
import { SurfaceTabs } from "./_components/surface-tabs";

const capabilityCards = [
	{
		eyebrow: "Today",
		title: "Cloud workspace, local workflow",
		copy:
			"Each agent runs in an isolated sandbox workspace with its own filesystem, so the local computer mental model can move into a cloud product.",
	},
	{
		eyebrow: "Today",
		title: "Code-embedded browser actions",
		copy:
			"Instrument existing product UIs with stable ids and let agents act inside the boundaries you define in code.",
	},
	{
		eyebrow: "Today",
		title: "Sandboxed agent runtimes",
		copy:
			"Run Gemini CLI or Codex CLI in Vercel Sandbox and expose them as a model interface your app already understands.",
	},
];

const sections = [
	"Hero promise",
	"Architecture snapshot",
	"Product surfaces",
	"Reference implementation",
];

const useCases = [
	"Support copilots that can click through internal tools instead of only replying with advice.",
	"Cloud agents that can read and write files inside an isolated workspace instead of pretending the browser is the whole computer.",
	"Ops assistants that live in chat, run in a sandbox, and return structured progress instead of wall-of-text output.",
	"Internal products that need OpenClaw-like UX without leaving the Next.js + AI SDK + Vercel stack.",
];

const docLinks = [
	{
		title: "What exists now",
		body: "Current capabilities grounded in this repository: chat runtime, sandbox agents, browser tool relay, Slack entrypoint, and structured UI rendering.",
	},
	{
		title: "What is close",
		body: "Near-term extensions that are consistent with the current architecture, even if not fully packaged as a polished product yet.",
	},
	{
		title: "How to think about it",
		body: "The point is not to clone OpenClaw. It is to make that style of agent UX natural inside Vercel-native apps.",
	},
];

export default function HomePage() {
	return (
		<main className="grid-lines min-h-screen">
			<header className="sticky top-0 z-20 border-b border-white/8 bg-[rgba(5,10,18,0.72)] backdrop-blur-xl">
				<div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
					<Link href="/" className="flex items-center gap-3">
						<div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[#84b8ff]/30 bg-[#102036] text-sm font-semibold text-[#dceaff]">
							GA
						</div>
						<div>
							<p className="text-sm font-medium text-white">Giselle Agent SDK</p>
							<p className="text-xs text-[var(--muted)]">
								Vercel-native agent UX
							</p>
						</div>
					</Link>
					<nav className="hidden items-center gap-5 text-sm text-[var(--muted)] md:flex">
						<a href="#architecture">Architecture</a>
						<a href="#surfaces">Surfaces</a>
						<Link href="/docs">Docs</Link>
					</nav>
				</div>
			</header>

			<section className="px-5 pb-20 pt-14 sm:px-8 sm:pt-20">
				<div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
					<div>
						<p className="fade-up font-mono text-[11px] uppercase tracking-[0.34em] text-[#8df6c9]">
							Vercel-native agent experiences
						</p>
						<h1 className="fade-up fade-up-delay mt-5 max-w-4xl text-5xl leading-[0.95] font-semibold tracking-[-0.05em] text-white sm:text-7xl">
							Build OpenClaw-like agent experiences on Vercel.
						</h1>
						<p className="fade-up fade-up-delay-2 mt-6 max-w-2xl text-lg leading-8 text-[var(--muted)] sm:text-xl">
							Bring the local filesystem-based agent workflow to the cloud with
							Next.js, the AI SDK, and Vercel Sandbox. Ship agents that chat,
							act, read and write files in their own workspace, and return
							structured UI instead of just text.
						</p>
						<div className="mt-9 flex flex-wrap items-center gap-3">
							<Link
								href="/docs"
								className="rounded-full bg-[#8df6c9] px-5 py-3 text-sm font-semibold text-[#07111b] transition hover:bg-[#acf8d8]"
							>
								Read the docs
							</Link>
							<a
								href="https://github.com/giselles-ai/agent-container"
								target="_blank"
								rel="noreferrer"
								className="rounded-full border border-white/10 px-5 py-3 text-sm text-white transition hover:border-[#84b8ff]/50 hover:bg-white/4"
							>
								View repository
							</a>
						</div>
						<div className="mt-10 grid gap-3 sm:grid-cols-3">
							{sections.map((item, index) => (
								<div
									key={item}
									className={`panel rounded-2xl px-4 py-4 ${
										index === 1 ? "sm:translate-y-4" : ""
									}`}
								>
									<p className="font-mono text-[10px] uppercase tracking-[0.26em] text-[#84b8ff]">
										0{index + 1}
									</p>
									<p className="mt-3 text-sm text-white">{item}</p>
								</div>
							))}
						</div>
					</div>

					<div className="panel-strong rounded-[32px] p-5">
						<div className="rounded-[24px] border border-white/8 bg-[#07101a] p-4">
							<div className="flex items-center justify-between border-b border-white/8 pb-4">
								<div>
									<p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[#84b8ff]">
										Reference flow
									</p>
									<p className="mt-2 text-sm text-white">
										From chat request to cloud-side work
									</p>
								</div>
								<div className="rounded-full border border-[#8df6c9]/30 bg-[#15372b]/70 px-3 py-1 text-xs text-[#bdfadd]">
								+ workspace filesystem
								</div>
							</div>
							<div className="mt-5 space-y-3">
								{[
									"User asks from web chat or Slack",
									"AI SDK streams through a Giselle provider",
									"Agent runs in Vercel Sandbox with its own workspace",
									"Files, commands, and tool activity execute in that sandbox",
									"Structured UI or task results land in the app",
								].map((step, index) => (
									<div
										key={step}
										className="flex items-center gap-4 rounded-2xl border border-white/8 bg-white/3 px-4 py-4"
									>
										<div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#102036] font-mono text-sm text-[#cfe1ff]">
											{index + 1}
										</div>
										<p className="text-sm leading-6 text-[var(--text)]">{step}</p>
									</div>
								))}
							</div>
							<div className="mt-5 rounded-2xl border border-dashed border-[#84b8ff]/30 bg-[#0d1826] px-4 py-4">
								<p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[#84b8ff]">
									Why this matters
								</p>
								<p className="mt-3 text-sm leading-6 text-[var(--muted)]">
									You keep the Vercel-native developer workflow while giving the
									agent a real cloud-side workspace. That is closer to the
									OpenClaw mental model than a plain chatbot, because the agent
									can work against files and tools, not only text.
								</p>
							</div>
						</div>
					</div>
				</div>
			</section>

			<section id="architecture" className="px-5 py-20 sm:px-8">
				<div className="mx-auto max-w-7xl">
					<div className="max-w-2xl">
						<p className="font-mono text-[11px] uppercase tracking-[0.34em] text-[#84b8ff]">
							Architecture snapshot
						</p>
						<h2 className="mt-4 text-3xl tracking-tight text-white sm:text-5xl">
							More than a chatbot, less than a reinvention.
						</h2>
						<p className="mt-5 text-base leading-7 text-[var(--muted)] sm:text-lg">
							The point is not to mimic another product pixel-by-pixel. It is
							to make that class of UX natural inside the stack Vercel teams
							already use, while preserving the feeling that the agent has a
							real workspace behind it.
						</p>
					</div>
					<div className="mt-10 grid gap-5 lg:grid-cols-3">
						{capabilityCards.map((card) => (
							<div key={card.title} className="panel rounded-[28px] p-6">
								<p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[#8df6c9]">
									{card.eyebrow}
								</p>
								<h3 className="mt-4 text-2xl tracking-tight text-white">
									{card.title}
								</h3>
								<p className="mt-4 text-sm leading-6 text-[var(--muted)]">
									{card.copy}
								</p>
							</div>
						))}
					</div>
				</div>
			</section>

			<section id="surfaces" className="px-5 py-20 sm:px-8">
				<div className="mx-auto max-w-7xl">
					<div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
						<div className="max-w-2xl">
							<p className="font-mono text-[11px] uppercase tracking-[0.34em] text-[#8df6c9]">
								Product surfaces
							</p>
							<h2 className="mt-4 text-3xl tracking-tight text-white sm:text-5xl">
								Four ways to make the promise feel real.
							</h2>
						</div>
						<p className="max-w-xl text-sm leading-6 text-[var(--muted)] sm:text-base">
							The point is range. The same stack can power a chat-native agent
							surface, structured UI responses, product-embedded automation,
							and cross-channel continuity from one runtime.
						</p>
					</div>
					<div className="mt-10">
						<SurfaceTabs />
					</div>
				</div>
			</section>

			<section className="px-5 py-20 sm:px-8">
				<div className="mx-auto max-w-7xl rounded-[36px] border border-[#84b8ff]/18 bg-[linear-gradient(135deg,rgba(132,184,255,0.12),rgba(141,246,201,0.08))] p-7 sm:p-10">
					<div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
						<div>
							<p className="font-mono text-[11px] uppercase tracking-[0.34em] text-[#84b8ff]">
								Reference implementation
							</p>
							<h2 className="mt-4 text-3xl tracking-tight text-white sm:text-5xl">
								Not a claim. A repo.
							</h2>
							<p className="mt-5 text-base leading-7 text-[#d7e5fb]">
								This repository already contains the pieces that make the
								message credible: a browser-action demo, a chat app, Slack
								entrypoints, structured UI rendering, and the agent provider
								layer that ties them together.
							</p>
						</div>
						<div className="grid gap-3">
							{useCases.map((item) => (
								<div
									key={item}
									className="rounded-[24px] border border-white/10 bg-[#07111b]/70 px-5 py-5 text-sm leading-6 text-[#dfeaf9]"
								>
									{item}
								</div>
							))}
						</div>
					</div>
					<div className="mt-8 flex flex-wrap gap-3">
						<Link
							href="/docs"
							className="rounded-full border border-white/10 bg-white/6 px-5 py-3 text-sm text-white transition hover:border-white/20 hover:bg-white/10"
						>
							See implementation notes
						</Link>
						<a
							href="https://github.com/giselles-ai/agent-container/tree/main/apps/chat-app"
							target="_blank"
							rel="noreferrer"
							className="rounded-full border border-white/10 px-5 py-3 text-sm text-white transition hover:border-white/20 hover:bg-white/6"
						>
							Inspect chat app
						</a>
					</div>
				</div>
			</section>

			<section className="px-5 py-20 sm:px-8">
				<div className="mx-auto max-w-7xl">
					<div className="grid gap-5 lg:grid-cols-3">
						{docLinks.map((item) => (
							<div key={item.title} className="panel rounded-[28px] p-6">
								<h3 className="text-xl tracking-tight text-white">{item.title}</h3>
								<p className="mt-4 text-sm leading-6 text-[var(--muted)]">
									{item.body}
								</p>
							</div>
						))}
					</div>
				</div>
			</section>

			<footer className="border-t border-white/8 px-5 py-8 sm:px-8">
				<div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
					<p className="text-sm text-[var(--muted)]">
						Built for teams who want agent UX in the Vercel stack they already
						ship on.
					</p>
					<div className="flex items-center gap-4 text-sm text-white">
						<Link href="/docs">Docs</Link>
						<a
							href="https://github.com/giselles-ai/agent-container"
							target="_blank"
							rel="noreferrer"
						>
							GitHub
						</a>
					</div>
				</div>
			</footer>
		</main>
	);
}
