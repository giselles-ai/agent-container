export default function Page() {
	return (
		<main className="min-h-screen p-6 text-slate-100 sm:p-10">
			<section className="mx-auto max-w-3xl rounded-2xl border border-slate-700/60 bg-slate-900/50 p-6 shadow-2xl backdrop-blur">
				<p className="text-xs uppercase tracking-[0.18em] text-cyan-300/80">
					Giselles Agent Demo
				</p>
				<h1 className="mt-2 text-3xl font-semibold">Agent Runner Prototype</h1>
				<p className="mt-3 text-sm text-slate-300/90">
					Open the Gemini Browser Tool demo to run browser automation through
					<code className="mx-1 rounded bg-slate-800 px-1 py-0.5">
						/api/chat
					</code>
					with{" "}
					<code className="mx-1 rounded bg-slate-800 px-1 py-0.5">
						useChat()
					</code>
					.
				</p>
				<a
					href="/gemini-browser-tool"
					className="mt-5 inline-flex rounded-md border border-slate-600 px-3 py-2 text-sm text-slate-200 transition hover:border-cyan-400 hover:text-cyan-200"
				>
					Open Gemini Browser Tool Demo
				</a>
			</section>
		</main>
	);
}
