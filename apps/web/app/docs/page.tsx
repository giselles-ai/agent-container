import Link from "next/link";

const currentCapabilities = [
	{
		name: "Sandbox workspace and filesystem",
		status: "Implemented",
		detail:
			"Agents run inside Vercel Sandbox with an isolated workspace, so they can operate against files and commands in a cloud-side environment instead of being limited to pure chat state.",
	},
	{
		name: "Code-level browser instrumentation",
		status: "Implemented",
		detail:
			"Existing web app elements can be exposed to the agent with stable ids inside product code, rather than relying on a browser extension or brittle selectors.",
	},
	{
		name: "AI SDK-compatible agent runtime",
		status: "Implemented",
		detail:
			"CLI agents are exposed as a model provider and used through standard AI SDK flows.",
	},
	{
		name: "Browser action loop",
		status: "Implemented",
		detail:
			"Agents can inspect DOM state, click, fill, and stream tool progress back to the client.",
	},
	{
		name: "Chat app foundation",
		status: "Implemented",
		detail:
			"Authenticated chat UI with persistence, streaming responses, and structured message rendering.",
	},
	{
		name: "Slack entrypoint",
		status: "Implemented",
		detail:
			"A Slack webhook path sends thread history into the same runtime used by the web app.",
	},
	{
		name: "Structured UI responses",
		status: "Implemented",
		detail:
			"Agents can emit charts, callouts, and progress UI through a JSON render catalog.",
	},
];

const likelyNext = [
	{
		name: "OpenClaw-style agent inbox",
		detail:
			"The existing chat app can be repositioned into a task-oriented inbox with agent status, starter prompts, and clearer action framing.",
	},
	{
		name: "Cross-surface continuity",
		detail:
			"With web chat and Slack already sharing the runtime shape, a tighter shared-thread or shared-session story is a natural product step.",
	},
	{
		name: "Media-rich demos",
		detail:
			"The landing page is intentionally prepared for short clips or screenshots that show visible action, not just architecture.",
	},
];

const repoProof = [
	{
		title: "minimum-demo",
		description:
			"Shows direct browser-tool interaction from an AI SDK chat loop into a visible spreadsheet UI.",
	},
	{
		title: "chat-app",
		description:
			"Shows the more product-like surface: authentication, chat persistence, structured rendering, and Slack entrypoints.",
	},
	{
		title: "packages/*",
		description:
			"Contain the provider, browser tool bridge, and agent definition layers that make the marketing claim technically grounded.",
	},
];

export default function DocsPage() {
	return (
		<main className="min-h-screen px-5 py-10 sm:px-8">
			<div className="mx-auto max-w-6xl">
				<div className="flex flex-wrap items-center justify-between gap-4">
					<div>
						<p className="font-mono text-[11px] uppercase tracking-[0.34em] text-[#84b8ff]">
							Docs
						</p>
						<h1 className="mt-4 text-4xl tracking-tight text-white sm:text-6xl">
							What this repo already proves.
						</h1>
					</div>
					<Link
						href="/"
						className="rounded-full border border-white/10 px-4 py-2 text-sm text-white transition hover:border-white/20 hover:bg-white/5"
					>
						Back home
					</Link>
				</div>

				<div className="mt-8 max-w-3xl rounded-[28px] border border-[#84b8ff]/16 bg-[#0a1421]/85 p-6">
					<p className="text-lg leading-8 text-[#dbe8fb]">
						This site borrows the structure of an OpenClaw-style landing page:
						hero promise first, proof second, capability grid third. The claim
						here is narrower and more developer-facing: you can build that
						class of agent UX on Vercel, with this stack, and give the agent a
						real cloud-side workspace to operate in.
					</p>
				</div>

				<section className="mt-14">
					<div className="max-w-2xl">
						<p className="font-mono text-[11px] uppercase tracking-[0.34em] text-[#8df6c9]">
							Current capabilities
						</p>
						<h2 className="mt-4 text-3xl tracking-tight text-white sm:text-4xl">
							Implemented in this repository today.
						</h2>
					</div>
					<div className="mt-8 grid gap-4">
						{currentCapabilities.map((item) => (
							<div
								key={item.name}
								className="panel rounded-[26px] px-6 py-5 sm:grid sm:grid-cols-[1.2fr_160px_1.4fr] sm:items-start sm:gap-6"
							>
								<h3 className="text-xl tracking-tight text-white">{item.name}</h3>
								<div className="mt-3 sm:mt-0">
									<span className="rounded-full border border-[#8df6c9]/20 bg-[#15372b]/50 px-3 py-1 text-xs font-medium text-[#c1fbe1]">
										{item.status}
									</span>
								</div>
								<p className="mt-4 text-sm leading-6 text-[var(--muted)] sm:mt-0">
									{item.detail}
								</p>
							</div>
						))}
					</div>
				</section>

				<section className="mt-16 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
					<div className="panel-strong rounded-[32px] p-6">
						<p className="font-mono text-[11px] uppercase tracking-[0.34em] text-[#84b8ff]">
							Likely next
						</p>
						<h2 className="mt-4 text-3xl tracking-tight text-white">
							Reasonable extensions from the current architecture.
						</h2>
						<div className="mt-6 space-y-4">
							{likelyNext.map((item, index) => (
								<div
									key={item.name}
									className="rounded-[24px] border border-white/8 bg-white/4 px-5 py-5"
								>
									<p className="font-mono text-[10px] uppercase tracking-[0.26em] text-[#84b8ff]">
										0{index + 1}
									</p>
									<h3 className="mt-3 text-xl tracking-tight text-white">
										{item.name}
									</h3>
									<p className="mt-3 text-sm leading-6 text-[var(--muted)]">
										{item.detail}
									</p>
								</div>
							))}
						</div>
					</div>

					<div className="space-y-6">
						<div className="placeholder-frame panel rounded-[28px] p-6">
							<div className="relative z-10 min-h-[240px] rounded-[22px] border border-dashed border-[#84b8ff]/30 bg-[#07111b]/70 p-5">
								<p className="font-mono text-[11px] uppercase tracking-[0.34em] text-[#8df6c9]">
									Video placeholder
								</p>
								<h3 className="mt-4 text-2xl tracking-tight text-white">
									Show the agent taking action.
								</h3>
								<p className="mt-4 max-w-md text-sm leading-6 text-[var(--muted)]">
									Recommended clip: request arrives, tool activity streams,
									browser action happens, structured result lands.
								</p>
							</div>
						</div>
						<div className="panel rounded-[28px] p-6">
							<p className="font-mono text-[11px] uppercase tracking-[0.34em] text-[#84b8ff]">
								Repository proof points
							</p>
							<div className="mt-5 space-y-4">
								{repoProof.map((item) => (
									<div key={item.title}>
										<h3 className="text-lg tracking-tight text-white">
											{item.title}
										</h3>
										<p className="mt-2 text-sm leading-6 text-[var(--muted)]">
											{item.description}
										</p>
									</div>
								))}
							</div>
						</div>
					</div>
				</section>

				<section className="mt-16 rounded-[32px] border border-white/10 bg-[#0a1421]/82 p-7">
					<p className="font-mono text-[11px] uppercase tracking-[0.34em] text-[#8df6c9]">
						Messaging guidance
					</p>
					<h2 className="mt-4 text-3xl tracking-tight text-white">
						Keep the claim specific.
					</h2>
					<ul className="mt-5 space-y-3 text-sm leading-6 text-[var(--muted)]">
						<li>
							Say `OpenClaw-like` or `OpenClaw-style`, not `OpenClaw on
							Vercel`.
						</li>
						<li>
							Lead with the product surface: agents that chat, act, and return
							UI.
						</li>
						<li>
							Use the stack terms in the subhead, not as the headline itself.
						</li>
						<li>
							Back the claim with concrete demos and references to existing app
							surfaces in the repo.
						</li>
					</ul>
				</section>
			</div>
		</main>
	);
}
