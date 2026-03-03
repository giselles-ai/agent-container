import { CodeDiffTabs } from "./_components/code-diff-tabs";
import { HeroDemoMockup } from "./_components/hero-demo";
import { HeroSequence } from "./_components/hero-sequence";

export default function MarketingPage() {
	return (
		<main className="min-h-screen text-slate-100">
			{/* Header */}
			<header className="px-6 pt-8 sm:px-10">
				<div className="mx-auto max-w-6xl">
					<p
						className="text-lg font-semibold tracking-wide text-slate-200"
						style={{ fontFamily: "var(--font-tomorrow)" }}
					>
						Sandbox Agent
					</p>
				</div>
			</header>
			{/* Hero */}
			<section className="px-6 pt-20 pb-16 sm:px-10 sm:pt-28 sm:pb-20">
				<div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 lg:grid-cols-2">
					<div>
						<h1 className="text-4xl leading-[1.15] font-normal tracking-tight">
							Give your app an agent.
							<br />
							<span className="text-slate-400">It fills in the form.</span>
						</h1>
						<div className="mt-6 space-y-1">
							<p className="text-base leading-relaxed text-slate-500 sm:text-lg">
								Wrap Gemini CLI or Codex as{" "}
								<code className="text-slate-400">LanguageModelV3</code>.
							</p>
							<p className="text-base leading-relaxed text-slate-500 sm:text-lg">
								Your app talks to it like any other model.
							</p>
						</div>
						<div className="mt-8 inline-flex items-center rounded-md border border-slate-800 bg-slate-950 px-5 py-3 font-mono text-sm">
							<span className="mr-3 text-slate-600">$</span>
							<span className="text-slate-300">
								npm i @giselles-ai/giselle-provider
							</span>
						</div>
					</div>
					<HeroDemoMockup />
				</div>
			</section>
			{/* AI SDK integration (cf. Turborepo "Scale your workflows") */}
			<section className="px-6 py-20 sm:px-10">
				<div className="mx-auto max-w-6xl">
					<h2 className="text-2xl font-normal tracking-tight sm:text-3xl">
						More capability. Same SDK.
					</h2>
					<p className="mt-4 text-base text-slate-500 sm:text-lg">
						Our provider wraps CLI agents, sandboxed runtimes, and browser
						automation as a single AI SDK model. Your tooling stays the same.
					</p>

					<CodeDiffTabs />

					<div className="mt-6">
						<a
							href="https://github.com/giselles-ai/agent-container#readme"
							target="_blank"
							rel="noopener noreferrer"
							className="text-sm font-medium text-slate-400 transition hover:text-slate-200"
						>
							Read the docs →
						</a>
					</div>

					<HeroSequence />

					<div className="mt-12 grid gap-6 sm:grid-cols-3">
						<div className="rounded-lg border border-slate-800 p-6">
							<p className="text-sm font-medium text-cyan-400">
								LanguageModelV3
							</p>
							<p className="mt-3 text-sm leading-relaxed text-slate-400">
								<code className="text-slate-300">streamText()</code>,{" "}
								<code className="text-slate-300">useChat()</code>,{" "}
								<code className="text-slate-300">generateText()</code> — every
								AI SDK pattern you know, unchanged.
							</p>
						</div>
						<div className="rounded-lg border border-slate-800 p-6">
							<p className="text-sm font-medium text-emerald-400">
								Browser as a tool
							</p>
							<p className="mt-3 text-sm leading-relaxed text-slate-400">
								Agents snapshot the DOM, fill inputs, click buttons. Your UI
								becomes their interface.
							</p>
						</div>
						<div className="rounded-lg border border-slate-800 p-6">
							<p className="text-sm font-medium text-emerald-400">
								Sandboxed agents
							</p>
							<p className="mt-3 text-sm leading-relaxed text-slate-400">
								Gemini CLI or Codex in an isolated Vercel Sandbox. Stateful.
								Disposable.
							</p>
						</div>
					</div>
				</div>
			</section>
			<section className="px-6 py-32 sm:px-10">
				<div className="mx-auto max-w-6xl">
					<h2 className="text-2xl font-normal tracking-tight sm:text-3xl">
						See it fill in a form.
					</h2>
					<p className="mt-4 text-base text-slate-500">
						Paste a receipt. Watch the expense report write itself.
					</p>
					<div className="mt-10 flex flex-wrap items-center gap-4">
						<a
							href="/demo"
							className="inline-flex rounded-md border border-slate-700 px-5 py-2.5 text-sm font-medium text-slate-200 transition hover:border-slate-500"
						>
							Try the Demo
						</a>
						<a
							href="https://github.com/giselles-ai/agent-container"
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex rounded-md border border-slate-800 px-5 py-2.5 text-sm font-medium text-slate-400 transition hover:border-slate-600"
						>
							View on GitHub
						</a>
					</div>
					<div className="mt-10 inline-flex items-center rounded-md border border-slate-800 bg-slate-950 px-5 py-3 font-mono text-sm">
						<span className="mr-3 text-slate-600">$</span>
						<span className="text-slate-300">
							npm i @giselles-ai/giselle-provider
						</span>
					</div>
				</div>
			</section>
			;
		</main>
	);
}
