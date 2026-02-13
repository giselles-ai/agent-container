export default function NewAgentPage() {
	return (
		<main className="min-h-screen bg-slate-950 text-slate-100">
			<div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-6 py-12">
				<header className="mb-8">
					<p className="text-xs uppercase tracking-[0.3em] text-slate-400">
						New Agent
					</p>
					<h1 className="mt-2 text-3xl font-semibold text-slate-50">
						Build your agent with the CLI
					</h1>
					<p className="mt-2 text-sm text-slate-400">
						Create, upload, and run an agent in a few commands.
					</p>
				</header>

				<div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-sm">
					<p className="text-slate-300">1. Create a new agent</p>
					<pre className="mt-3 rounded-xl bg-slate-950/70 p-4 text-xs text-slate-200">
						{`npx @giselles-ai/agent create`}
					</pre>
					<p className="mt-6 text-slate-300">2. Upload the bundle</p>
					<pre className="mt-3 rounded-xl bg-slate-950/70 p-4 text-xs text-slate-200">
						{`npx @giselles-ai/agent up`}
					</pre>
					<p className="mt-6 text-slate-300">3. Run from this UI</p>
					<pre className="mt-3 rounded-xl bg-slate-950/70 p-4 text-xs text-slate-200">
						{`npx @giselles-ai/agent run <slug>`}
					</pre>
				</div>
			</div>
		</main>
	);
}
