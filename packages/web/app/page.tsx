export default function MarketingPage() {
	return (
		<main className="min-h-screen text-slate-100">
			{/* Act 1: Reader's World (Before) */}
			<section className="px-6 py-32 sm:px-10">
				<div className="mx-auto max-w-3xl">
					<h1 className="text-5xl leading-tight font-semibold sm:text-6xl">
						Your AI knows exactly what to fill in.
						<br />
						<span className="text-slate-400">
							It just&hellip; doesn&apos;t.
						</span>
					</h1>
					<div className="mt-10 space-y-6 text-lg leading-relaxed text-slate-300">
						<p>
							<code className="rounded bg-slate-800 px-1.5 py-0.5 text-cyan-400">
								streamText()
							</code>{" "}
							and{" "}
							<code className="rounded bg-slate-800 px-1.5 py-0.5 text-cyan-400">
								useChat()
							</code>{" "}
							&mdash; you can build a conversation UI in hours.
						</p>
						<p>
							Your user pastes an invoice into the chat. The AI reads it
							perfectly &mdash; date, amount, invoice number. It writes back a
							beautiful summary.
						</p>
						<p>
							Then your user looks at the expense form sitting right there on
							the same page. Still empty.
						</p>
						<p className="text-slate-400">
							The AI that understands everything. The form that stays blank. The
							gap between knowing and doing.
						</p>
					</div>
				</div>
			</section>

			{/* Act 2: Perspective Shift (During) */}
			<section className="px-6 py-24 sm:px-10">
				<div className="mx-auto max-w-3xl">
					<h2 className="text-3xl font-semibold text-cyan-400 sm:text-4xl">
						What if a CLI agent came through the{" "}
						<span className="text-cyan-200">LanguageModelV3</span> interface?
					</h2>
					<p className="mt-6 text-lg leading-relaxed text-slate-300">
						Not a new framework. Not a new SDK. Just a{" "}
						<code className="rounded bg-slate-800 px-1.5 py-0.5 text-cyan-400">
							LanguageModelV3
						</code>{" "}
						that happens to have hands.
					</p>
					<div className="mt-10 overflow-x-auto rounded-lg border border-slate-700 bg-slate-950 p-6">
						<pre className="text-sm leading-relaxed text-slate-200">
							<code>
								{[
									'import { giselle } from "@giselles-ai/giselle-provider";',
									'import { streamText, tool } from "ai";',
									"",
									"const result = streamText({",
									"  model: giselle({",
									'    cloudApiUrl: "https://studio.giselles.ai",',
									"    agent,",
									"  }),",
									"  messages: await convertToModelMessages(messages),",
									"  tools,",
									"});",
								].join("\n")}
							</code>
						</pre>
					</div>
					<p className="mt-6 text-base leading-relaxed text-slate-400">
						That&apos;s the actual route handler. The same{" "}
						<code className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-300">
							streamText()
						</code>{" "}
						you already use &mdash; but now the model can see your DOM and fill
						in forms.
					</p>
				</div>
			</section>

			{/* Act 3: Transformed World (After) */}
			<section className="px-6 py-24 sm:px-10">
				<div className="mx-auto max-w-3xl">
					<h2 className="text-3xl font-semibold sm:text-4xl">
						Here&apos;s what happens behind those 20 lines.
					</h2>
					<p className="mt-6 text-lg leading-relaxed text-slate-300">
						Three packages, each doing one thing:
					</p>
					<div className="mt-10 grid gap-6 sm:grid-cols-3">
						<div className="rounded-lg border border-slate-700 bg-slate-900/50 p-6">
							<p className="text-sm font-semibold text-cyan-400">
								@giselles-ai/giselle-provider
							</p>
							<p className="mt-3 text-sm leading-relaxed text-slate-300">
								Wraps a CLI agent as a{" "}
								<code className="text-slate-200">LanguageModelV3</code>. Your
								app talks to it like any other model.
							</p>
						</div>
						<div className="rounded-lg border border-slate-700 bg-slate-900/50 p-6">
							<p className="text-sm font-semibold text-emerald-400">
								@giselles-ai/browser-tool
							</p>
							<p className="mt-3 text-sm leading-relaxed text-slate-300">
								Snapshots the DOM. Executes fill, click, and select actions. The
								bridge between the agent and your UI.
							</p>
						</div>
						<div className="rounded-lg border border-slate-700 bg-slate-900/50 p-6">
							<p className="text-sm font-semibold text-emerald-400">
								@giselles-ai/sandbox-agent
							</p>
							<p className="mt-3 text-sm leading-relaxed text-slate-300">
								Runs a CLI agent (Gemini, Codex) inside a Vercel Sandbox.
								Isolated. Stateful. Ready when you are.
							</p>
						</div>
					</div>
					<div className="mt-16 space-y-4 text-lg leading-relaxed text-slate-300">
						<p>Form autofill is just the first use case.</p>
						<p className="text-slate-400">
							Any operation your product has &mdash; any form, any workflow, any
							multi-step process &mdash; can be delegated to an agent.
						</p>
					</div>
				</div>
			</section>

			{/* CTA */}
			<section className="px-6 py-24 sm:px-10">
				<div className="mx-auto max-w-3xl text-center">
					<h2 className="text-3xl font-semibold sm:text-4xl">See it work.</h2>
					<p className="mt-4 text-lg text-slate-400">
						An expense report. A receipt. An AI that fills in the form for you.
					</p>
					<div className="mt-10 flex flex-wrap items-center justify-center gap-4">
						<a
							href="/demo"
							className="inline-flex rounded-md border border-cyan-400 bg-cyan-400/10 px-6 py-3 text-base font-medium text-cyan-200 transition hover:bg-cyan-400/20"
						>
							Try the Demo
						</a>
						<a
							href="https://github.com/giselles-ai/agent-container"
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex rounded-md border border-slate-600 px-6 py-3 text-base font-medium text-slate-300 transition hover:border-slate-400"
						>
							View on GitHub
						</a>
						<a
							href="https://github.com/giselles-ai/agent-container#readme"
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex rounded-md border border-slate-600 px-6 py-3 text-base font-medium text-slate-300 transition hover:border-slate-400"
						>
							Read the Docs
						</a>
					</div>
				</div>
			</section>
		</main>
	);
}
