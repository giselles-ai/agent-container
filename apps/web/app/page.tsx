import Image from "next/image";
import Link from "next/link";
import { ButtonLink } from "../components/button-link";

const buildTargets = [
	{
		title: "Inspectable OpenClaw-like apps",
		copy: "Ship the kind of tool-using agent experience people already recognize, but as an app they can inspect and understand on Vercel.",
	},
	{
		title: "Agents with a real workspace",
		copy: "Keep files, revisions, and artifacts inside Vercel Sandbox so the agent's work does not disappear into a chat thread.",
	},
	{
		title: "Build-and-update by diff",
		copy: "Start with /build-agent-skill, extend with /update-agent-skill, and let people learn the system by reading the changes.",
	},
	{
		title: "Safe-to-try agent surfaces",
		copy: "Let users try browser actions, CLI-native tools, and structured UI in a familiar Vercel app instead of trusting an unknown local setup.",
	},
] satisfies Array<{
	title: string;
	copy: string;
}>;

const coreCapabilities = [
	{
		title: "Ship it as part of your app",
		copy: "Create the runtime at build time, then deploy it on Vercel with the rest of your product.",
	},
	{
		title: "Give the agent a real workspace",
		copy: "Files, artifacts, and revisions live inside Vercel Sandbox instead of disappearing into a chat thread.",
	},
	{
		title: "Bring CLI-native agents to the web",
		copy: "Bridge agent runtimes like Codex CLI or Gemini CLI into a Vercel-native app surface.",
	},
	{
		title: "Work inside your product",
		copy: "Drive browser actions in real product flows, not just in a detached demo tab.",
	},
	{
		title: "Return UI people can act on",
		copy: "Stream structured payloads so your app can render state, actions, and artifacts directly.",
	},
	{
		title: "Stay with the same agent everywhere",
		copy: "Keep one runtime across inbox-style chat, team workflows, and other chat-native surfaces.",
	},
] satisfies Array<{
	title: string;
	copy: string;
}>;

const integrations = [
	"Next.js",
	"Vercel Sandbox",
	"AI SDK",
	"Codex CLI",
	"Gemini CLI",
	"Slack",
] as const;

const quickStart = [
	"Install the SDK and runtime packages.",
	"Wrap your Next.js app with the Giselle agent plugin.",
	"Use /build-agent-skill to define an agent with tools, workspace, and UI output.",
	"Use /update-agent-skill to evolve it, then deploy the same agent surface on web or Slack.",
] as const;

export default function HomePage() {
	return (
		<main className="min-h-screen">
			<header className="sticky top-0 z-20">
				<div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
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
						<Link href="/docs">Docs</Link>
					</nav>
				</div>
			</header>

			<section className="px-5 pb-20 pt-14 sm:px-8 sm:pt-20">
				<div className="mx-auto max-w-6xl text-center">
					<div className="flex flex-col items-center">
						{/*<p className="fade-up font-mono text-[11px] uppercase tracking-[0.34em] text-muted">
							Giselle Sandbox Agent API
						</p>*/}
						<h1 className="fade-up fade-up-delay mt-5 max-w-4xl text-4xl leading-[0.95] tracking-[-0.05em] text-text sm:text-7xl">
							Build inspectable OpenClaw-like agents on Vercel
						</h1>

						<p className="fade-up fade-up-delay-2 mt-5 max-w-3xl leading-7 text-muted">
							Build agents that chat, use tools, and return UI inside your
							Vercel app, with a real workspace people can inspect, update,
							and trust. Run the same runtime across the web, internal
							workflows, and Slack.
						</p>
						<div className="mt-9 flex flex-wrap items-center gap-3">
							<ButtonLink href="/docs" variant="solid">
								Get started
							</ButtonLink>
							<ButtonLink
								href="https://github.com/giselles-ai/agent-container"
								target="_blank"
								rel="noreferrer"
								variant="default"
							>
								View on GitHub
							</ButtonLink>
						</div>
					</div>
				</div>
			</section>

			<section className="px-5 pb-8 sm:px-8">
				<div className="mx-auto max-w-6xl border-t border-white/10 pt-10">
					<div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
						<div>
							<p className="font-mono text-[11px] uppercase tracking-[0.34em] text-muted">
								What You Can Build
							</p>
						</div>
						<div className="grid gap-8 sm:grid-cols-2">
							{buildTargets.map((item) => (
								<div key={item.title}>
									<h2 className="text-xl font-semibold tracking-[-0.02em] text-text">
										{item.title}
									</h2>
									<p className="mt-3 max-w-xl text-[15px] leading-7 text-muted">
										{item.copy}
									</p>
								</div>
							))}
						</div>
					</div>
				</div>
			</section>

			<section id="today" className="px-5 py-12 sm:px-8 sm:py-16">
				<div className="mx-auto max-w-6xl">
					<div className="grid gap-6 border-t border-white/10 pt-10 lg:grid-cols-[220px_minmax(0,1fr)]">
						<div>
							<p className="font-mono text-[11px] uppercase tracking-[0.34em] text-muted">
								Core Capabilities
							</p>
						</div>
						<div className="max-w-3xl">
							<p className="text-[15px] leading-7 text-muted">
								Everything you need to build agents that can take on real
								operational work, not just answer in chat.
							</p>
						</div>
					</div>
					<div className="mt-10 grid gap-x-0 gap-y-0 md:grid-cols-2 xl:grid-cols-3">
						{coreCapabilities.map((item) => {
							return (
								<div
									key={item.title}
									className="border-t border-white/10 px-0 py-8 first:border-t-0 md:px-8 md:[&:nth-child(2)]:border-t-0 md:[&:nth-child(2n)]:border-l xl:[&:nth-child(2n)]:border-l-0 xl:[&:nth-child(-n+3)]:border-t-0 xl:[&:nth-child(3n+2)]:border-l xl:[&:nth-child(3n+3)]:border-l"
								>
									<h3 className="mb-3 text-xl font-semibold text-text">
										{item.title}
									</h3>
									<p className="text-[15px] leading-7 text-muted">
										{item.copy}
									</p>
								</div>
							);
						})}
					</div>
				</div>
			</section>

			<section className="px-5 py-10 sm:px-8 sm:py-14">
				<div className="mx-auto max-w-6xl border-t border-white/10 pt-10">
					<div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
						<div>
							<p className="font-mono text-[11px] uppercase tracking-[0.34em] text-muted">
								Works With
							</p>
						</div>
						<div className="flex flex-wrap gap-x-6 gap-y-3 text-lg tracking-[-0.02em] text-text sm:text-xl">
							{integrations.map((item) => (
								<p key={item} className="text-text">
									{item}
								</p>
							))}
						</div>
					</div>
				</div>
			</section>

			<section className="px-5 pb-24 pt-10 sm:px-8 sm:pb-32 sm:pt-14">
				<div className="mx-auto max-w-6xl border-t border-white/10 pt-10">
					<div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
						<div>
							<p className="font-mono text-[11px] uppercase tracking-[0.34em] text-muted">
								Quick Start
							</p>
						</div>
						<div className="grid gap-6 md:grid-cols-2">
							{quickStart.map((item, index) => (
								<div
									key={item}
									className="border-t border-white/10 py-5 md:first:border-t md:[&:nth-child(2)]:border-t"
								>
									<p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted">
										0{index + 1}
									</p>
									<p className="mt-3 max-w-xl text-[15px] leading-7 text-text">
										{item}
									</p>
								</div>
							))}
						</div>
					</div>
				</div>
			</section>
		</main>
	);
}
