import Image from "next/image";
import Link from "next/link";
import { ButtonLink } from "../components/button-link";

const buildTargets = [
	{
		title: "OpenClaw-like, but deployable",
		copy: "Ship the kind of tool-using, UI-returning agent experience people already recognize, but run it inside a Vercel app instead of asking users to trust an unknown local setup.",
	},
	{
		title: "A real workspace, not a disappearing chat log",
		copy: "Files, artifacts, and revisions live inside Vercel Sandbox so people can inspect what the agent actually did.",
	},
	{
		title: "Readable updates by diff",
		copy: "Start with the skill workflow, then evolve the agent through file changes people can review in git rather than opaque prompt history.",
	},
	{
		title: "One runtime across surfaces",
		copy: "Keep the same agent runtime for web, internal workflows, and Slack while preserving the same workspace-centered model.",
	},
] satisfies Array<{
	title: string;
	copy: string;
}>;

const trustSignals = [
	{
		title: "Files are visible",
		copy: "When the agent writes notes, drafts code, or creates artifacts, that work stays in the sandbox workspace instead of being implied by chat output alone.",
	},
	{
		title: "Sandbox state is explicit",
		copy: "The runtime is a real sandboxed environment with inspectable files and tool behavior, not a hidden cloud agent you have to mentally model.",
	},
	{
		title: "Snapshots restore work",
		copy: "A conversation can create a new snapshot so the latest workspace can be restored even after the sandbox expires.",
	},
] satisfies Array<{
	title: string;
	copy: string;
}>;

const practicalFlows = [
	{
		title: "Generate files people can keep",
		copy: "Produce plans, markdown docs, code changes, and other useful artifacts in a workspace that can be checked and reused.",
	},
	{
		title: "Show the path from prompt to product",
		copy: "Use the skill to create the first version, then update the implementation through normal files and reviewable diffs.",
	},
	{
		title: "Make trust part of the product",
		copy: "Users can try agent actions in a familiar Vercel app while understanding where outputs live and how the runtime persists.",
	},
] satisfies Array<{
	title: string;
	copy: string;
}>;

const coreCapabilities = [
	{
		title: "Build on top of Next.js",
		copy: "Wrap your app with the Giselle agent plugin and create the runtime during dev and build, then deploy it alongside the rest of your product.",
	},
	{
		title: "Give the agent a file system",
		copy: "Let the agent create and edit real files inside the workspace so output can be inspected, reused, and discussed.",
	},
	{
		title: "Bring CLI-native agents to the web",
		copy: "Run Codex CLI or Gemini CLI behind a Vercel-native app surface instead of confining them to a local terminal.",
	},
	{
		title: "Drive tools in product context",
		copy: "Use browser actions and tool calls where the rest of your product already lives, not in a detached demo environment.",
	},
	{
		title: "Return structured UI",
		copy: "Stream UI payloads your app can render directly so people can inspect results, state, and next actions.",
	},
	{
		title: "Preserve continuity",
		copy: "Keep work alive through snapshots so sandbox expiration does not erase the latest useful state.",
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

const proofPoints = [
	"OpenClaw-like agent experience",
	"Inspectable files and artifacts",
	"Snapshot-based restore path",
];

export default function HomePage() {
	return (
		<main className="min-h-screen">
			<header className="sticky top-0 z-20 border-b border-white/10 bg-bg/80 backdrop-blur">
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
				<div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-end">
					<div>
						<p className="fade-up font-mono text-[11px] uppercase tracking-[0.34em] text-brand">
							OpenClaw-like on Vercel
						</p>
						<h1 className="fade-up fade-up-delay mt-5 max-w-4xl text-4xl leading-[0.95] tracking-[-0.05em] text-text sm:text-7xl">
							Build inspectable OpenClaw-like agent experiences on Vercel
						</h1>

						<p className="fade-up fade-up-delay-2 mt-5 max-w-3xl leading-7 text-muted">
							Run agents that chat, use tools, create files, and return UI
							inside your Vercel app. The point is not only capability. The
							point is legibility: people can understand the workspace, inspect
							the output, and trust how the runtime persists.
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

						<div className="mt-8 flex flex-wrap gap-3">
							{proofPoints.map((item) => (
								<p
									key={item}
									className="rounded-full border border-white/12 bg-white/[0.04] px-3 py-1.5 text-sm text-text"
								>
									{item}
								</p>
							))}
						</div>
					</div>

					<div className="panel-strong rounded-sm p-5">
						<p className="font-mono text-[11px] uppercase tracking-[0.34em] text-muted">
							Why people trust this
						</p>
						<div className="mt-5 space-y-4">
							<div className="rounded-sm border border-white/10 bg-white/[0.03] p-4">
								<p className="font-mono text-[11px] uppercase tracking-[0.28em] text-brand">
									Workspace
								</p>
								<p className="mt-2 text-sm leading-7 text-text">
									Agent-created files live in a real sandbox workspace, so the
									output is inspectable instead of implied.
								</p>
							</div>
							<div className="rounded-sm border border-white/10 bg-white/[0.03] p-4">
								<p className="font-mono text-[11px] uppercase tracking-[0.28em] text-brand">
									Sandbox
								</p>
								<p className="mt-2 text-sm leading-7 text-text">
									Tool use happens in an explicit environment you can reason
									about, not an invisible agent black box.
								</p>
							</div>
							<div className="rounded-sm border border-white/10 bg-white/[0.03] p-4">
								<p className="font-mono text-[11px] uppercase tracking-[0.28em] text-brand">
									Snapshot
								</p>
								<p className="mt-2 text-sm leading-7 text-text">
									Latest state can be restored from snapshots even after the
									live sandbox expires.
								</p>
							</div>
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

			<section className="px-5 py-12 sm:px-8 sm:py-16">
				<div className="mx-auto max-w-6xl border-t border-white/10 pt-10">
					<div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
						<div>
							<p className="font-mono text-[11px] uppercase tracking-[0.34em] text-muted">
								Trust Signals
							</p>
						</div>
						<div className="grid gap-6 md:grid-cols-3">
							{trustSignals.map((item) => (
								<div key={item.title} className="panel rounded-sm p-6">
									<h2 className="text-xl font-semibold tracking-[-0.02em] text-text">
										{item.title}
									</h2>
									<p className="mt-3 text-[15px] leading-7 text-muted">
										{item.copy}
									</p>
								</div>
							))}
						</div>
					</div>
				</div>
			</section>

			<section className="px-5 py-2 sm:px-8 sm:py-6">
				<div className="mx-auto max-w-6xl border-t border-white/10 pt-10">
					<div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
						<div>
							<p className="font-mono text-[11px] uppercase tracking-[0.34em] text-muted">
								Practical Flows
							</p>
						</div>
						<div className="grid gap-6 md:grid-cols-3">
							{practicalFlows.map((item) => (
								<div
									key={item.title}
									className="rounded-sm border border-white/10 p-6"
								>
									<h2 className="text-xl font-semibold tracking-[-0.02em] text-text">
										{item.title}
									</h2>
									<p className="mt-3 text-[15px] leading-7 text-muted">
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
						<div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_220px] md:items-start">
							<div className="panel rounded-sm p-6">
								<p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted">
									Install the skill
								</p>
								<pre className="mt-4 overflow-x-auto text-sm text-brand">
									<code>npx skills add giselles-ai/agent-container</code>
								</pre>
								<p className="mt-4 max-w-2xl text-[15px] leading-7 text-muted">
									Then use the <code>build-giselle-agent</code> skill from
									Codex, Claude Code, Cursor, or your preferred coding agent to
									scaffold or update an app.
								</p>
							</div>
							<div className="border-t border-white/10 py-5 md:border-t-0 md:py-0">
								<p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted">
									Learn more
								</p>
								<p className="mt-3 text-[15px] leading-7 text-muted">
									See the docs for setup, prompt examples, and update flows.
								</p>
								<div className="mt-5">
									<ButtonLink href="/docs" variant="default">
										Open docs
									</ButtonLink>
								</div>
							</div>
						</div>
					</div>
				</div>
			</section>
		</main>
	);
}
