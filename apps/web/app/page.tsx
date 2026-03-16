import Image from "next/image";
import Link from "next/link";

const todayCapabilities = [
	{
		title: "Build as Next.js app",
		copy: "Create the runtime at build time, then deploy it on Vercel with the rest of your product.",
	},
	{
		title: "Cloud workspace",
		copy: "Files, artifacts, and revisions live inside Vercel Sandbox instead of disappearing into a chat thread.",
	},
	{
		title: "Power of CLI",
		copy: "Bridge agent runtimes like Codex CLI or Gemini CLI into a Vercel-native app surface.",
	},
	{
		title: "Embed in real product",
		copy: "Drive browser actions in real product flows, not just in a detached demo tab.",
	},
	{
		title: "Return UI, not just text",
		copy: "Stream structured payloads so your app can render state, actions, and artifacts directly.",
	},
	{
		title: "Not just web",
		copy: "Keep one runtime across inbox-style chat, team workflows, and other chat-native surfaces.",
	},
] satisfies Array<{
	title: string;
	copy: string;
}>;

const proofPoints = [
	{
		name: "workspace-report-demo",
		detail:
			"Shows build-seeded files, report generation into ./artifacts/, and revision of existing files across turns.",
		href: "https://github.com/giselles-ai/agent-container/tree/main/examples/workspace-report-demo",
	},
	{
		name: "minimum-demo",
		detail:
			"Shows product-embedded browser automation with stable browser-tool ids in a visible app surface.",
		href: "https://github.com/giselles-ai/agent-container/tree/main/apps/minimum-demo",
	},
	{
		name: "chat-app",
		detail:
			"Shows the more product-like surface: chat persistence, structured rendering, and a Slack entrypoint.",
		href: "https://github.com/giselles-ai/agent-container/tree/main/apps/chat-app",
	},
];

const boundaries = [
	"Not a claim about a universal shared filesystem across every surface.",
	"Not a story about arbitrary user uploads mutating the agent environment at will.",
	"Not OpenClaw itself running on Vercel.",
	"The current mental model is build-first: define the agent, build it, then run it.",
];

export default function HomePage() {
	return (
		<main className="min-h-screen">
			<header className="sticky top-0 z-20">
				<div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
					<Link href="/" className="flex items-end gap-2.5">
						<Image
							src="/giselle-logo.svg"
							alt="giselle"
							width={68}
							height={28}
							className="h-auto w-[68px]"
							priority
						/>
						<p className="relative top-[-2px] text-[21px] font-semibold tracking-[-0.01em] text-[#dbe8fb]">
							Sandbox Agent
						</p>
					</Link>
					<nav className="hidden items-center gap-5 text-sm text-[var(--muted)] md:flex">
						<a href="#today">Today</a>
						<a href="#proof">Proof</a>
						<a href="#boundaries">Boundaries</a>
						<Link href="/docs">Docs</Link>
					</nav>
				</div>
			</header>

			<section className="px-5 pb-20 pt-14 sm:px-8 sm:pt-20">
				<div className="mx-auto max-w-5xl text-center">
					<div className="flex flex-col items-center">
						{/*<p className="fade-up font-mono text-[11px] uppercase tracking-[0.34em] text-[#8df6c9]">
							Giselle Sandbox Agent API
						</p>*/}
						<h1 className="fade-up fade-up-delay mt-5 max-w-4xl text-4xl leading-[0.95] tracking-[-0.05em] text-white sm:text-7xl">
							Build OpenClaw-like agent experiences on Vercel
						</h1>

						<p className="fade-up fade-up-delay-2 mt-5 max-w-3xl leading-7 text-[#d7e5fb]">
							Read and revise files, generate reports and JSON artifacts, drive
							browser actions inside your app, render structured UI, and
							continue the same agent from web chat or Slack
						</p>
						<div className="mt-9 flex flex-wrap items-center gap-3">
							<Link
								href="/docs"
								className="rounded-lg bg-white px-5 py-3 text-sm font-semibold text-black transition"
							>
								Read the docs
							</Link>
							<a
								href="https://github.com/giselles-ai/agent-container/tree/main/examples/workspace-report-demo"
								target="_blank"
								rel="noreferrer"
								className="rounded-lg border border-white/10 px-5 py-3 text-sm text-white transition hover:border-[#84b8ff]/50 hover:bg-white/4"
							>
								Open report demo
							</a>
						</div>
					</div>
				</div>
			</section>

			<section id="today" className="px-5 py-20">
				<div className="mx-auto max-w-7xl">
					<div className="flex justify-center gap-4 text-center text-xl">
						<p className="text-white font-bold">What It Does</p>
						<p className="text-white/70">
							Everything you need to build great Agents on top of the Vercel.
						</p>
					</div>
					<div className="mt-10 grid gap-x-0 gap-y-0 grid-cols-2 grid-cols-3">
						{todayCapabilities.map((item) => {
							return (
								<div
									key={item.title}
									className="border-t border-white/10 px-0 py-8 first:border-t-0 md:px-8 md:[&:nth-child(2)]:border-t-0 md:[&:nth-child(2n)]:border-l xl:[&:nth-child(2n)]:border-l-0 xl:[&:nth-child(-n+3)]:border-t-0 xl:[&:nth-child(3n+2)]:border-l xl:[&:nth-child(3n+3)]:border-l"
								>
									<h3 className="mb-3 text-xl font-semibold text-white">
										{item.title}
									</h3>
									<p className="text-[15px] leading-7 text-white/55">
										{item.copy}
									</p>
								</div>
							);
						})}
					</div>
				</div>
			</section>

			<section id="proof" className="px-5 py-20 sm:px-8">
				<div className="mx-auto max-w-7xl">
					<div className="grid gap-8 lg:grid-cols-[0.92fr_1.08fr]">
						<div>
							<p className="font-mono text-[11px] uppercase tracking-[0.34em] text-[#84b8ff]">
								Reference implementations
							</p>
							<h2 className="mt-4 text-3xl tracking-tight text-white sm:text-5xl">
								Working examples behind the capability story.
							</h2>
							<p className="mt-5 text-base leading-7 text-[#d7e5fb]">
								These examples are supporting evidence, not the headline. They
								show how the API and SDK map into concrete app surfaces across
								report generation, browser automation, and chat-native agent UX.
							</p>
							<div className="mt-8 flex flex-wrap gap-3">
								<Link
									href="/docs"
									className="rounded-lg border border-white/10 bg-white/6 px-5 py-3 text-sm text-white transition hover:border-white/20 hover:bg-white/10"
								>
									See implementation notes
								</Link>
								<a
									href="https://github.com/giselles-ai/agent-container"
									target="_blank"
									rel="noreferrer"
									className="rounded-lg border border-white/10 px-5 py-3 text-sm text-white transition hover:border-white/20 hover:bg-white/6"
								>
									View repository
								</a>
							</div>
						</div>
						<div className="grid gap-8">
							{proofPoints.map((item) => (
								<a
									key={item.name}
									href={item.href}
									target="_blank"
									rel="noreferrer"
									className="block border-l border-white/10 pl-5 transition hover:border-[#84b8ff]/40"
								>
									<p className="font-mono text-[10px] uppercase tracking-[0.26em] text-[#84b8ff]">
										example
									</p>
									<h3 className="mt-3 text-xl tracking-tight text-white">
										{item.name}
									</h3>
									<p className="mt-3 text-sm leading-6 text-[#dfeaf9]">
										{item.detail}
									</p>
								</a>
							))}
						</div>
					</div>
				</div>
			</section>

			<section id="boundaries" className="px-5 py-20 sm:px-8">
				<div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[1fr_1fr]">
					<div className="max-w-xl">
						<p className="font-mono text-[11px] uppercase tracking-[0.34em] text-[#8df6c9]">
							Product stance
						</p>
						<h2 className="mt-4 text-3xl tracking-tight text-white sm:text-4xl">
							Build-first agents, not chaotic mutable sandboxes.
						</h2>
						<p className="mt-5 text-sm leading-7 text-[var(--muted)] sm:text-base">
							The intended model is closer to Docker or Terraform than to a
							magic shared drive. Define the agent up front, build it into a
							snapshot, then run it with a clear mental model of what the agent
							starts with.
						</p>
					</div>
					<div className="max-w-xl lg:pl-8">
						<p className="font-mono text-[11px] uppercase tracking-[0.34em] text-[#84b8ff]">
							Boundaries
						</p>
						<h2 className="mt-4 text-3xl tracking-tight text-white sm:text-4xl">
							Keep the claim narrow and true.
						</h2>
						<ul className="mt-5 space-y-3 text-sm leading-6 text-[var(--muted)]">
							{boundaries.map((item) => (
								<li key={item}>{item}</li>
							))}
						</ul>
					</div>
				</div>
			</section>

			<footer className="border-t border-white/8 px-5 py-8 sm:px-8">
				<div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
					<p className="text-sm text-[var(--muted)]">
						Build OpenClaw-like agent experiences on Vercel with a real
						cloud-side runtime.
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
