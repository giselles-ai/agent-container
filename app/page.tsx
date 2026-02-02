export default function Home() {
	return (
		<main className="min-h-screen bg-slate-950 text-slate-100">
			<div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-6">
				<h1 className="text-3xl font-semibold">Agent Container</h1>
				<p className="mt-2 text-sm text-slate-400">
					UIMessage streaming demo for the sandbox endpoint.
				</p>
				<div className="flex gap-4">
					<a
						href="/sandbox/stream"
						className="mt-6 inline-flex w-fit items-center rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-100 transition hover:border-slate-500"
					>
						Open sandbox chat
					</a>
					<a
						href="/sandbox/tool-loop-agent"
						className="mt-6 inline-flex w-fit items-center rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-100 transition hover:border-slate-500"
					>
						Open pptx-agent chat
					</a>
					<a
						href="/sandbox/pptx-agent"
						className="mt-6 inline-flex w-fit items-center rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-100 transition hover:border-slate-500"
					>
						Open pptx-agent chat
					</a>
				</div>
			</div>
		</main>
	);
}
