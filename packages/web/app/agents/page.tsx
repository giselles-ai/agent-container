import Link from "next/link";
import { listManifests } from "@/lib/agent/storage";

export default async function AgentsPage() {
	const token = process.env.BLOB_READ_WRITE_TOKEN;
	const agents = await listManifests(token);

	return (
		<main className="min-h-screen bg-slate-950 text-slate-100">
			<div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-10">
				<header className="mb-8">
					<p className="text-xs uppercase tracking-[0.3em] text-slate-400">
						Agents
					</p>
					<h1 className="mt-2 text-3xl font-semibold text-slate-50">
						Deployed Agents
					</h1>
					<p className="mt-2 text-sm text-slate-400">
						Select an agent to run it in the sandbox.
					</p>
				</header>

				<div className="flex flex-wrap gap-3">
					<Link
						href="/agents/new"
						className="inline-flex items-center rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-100 transition hover:border-slate-500"
					>
						New agent
					</Link>
				</div>

				<div className="mt-6 grid gap-4 md:grid-cols-2">
					{agents.length === 0 ? (
						<div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-sm text-slate-400">
							No agents yet. Create one with the CLI first.
						</div>
					) : (
						agents.map((agent) => (
							<Link
								key={agent.slug}
								href={`/agents/${agent.slug}`}
								className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 transition hover:border-slate-600"
							>
								<p className="text-xs uppercase tracking-[0.2em] text-slate-500">
									{agent.slug}
								</p>
								<h2 className="mt-2 text-xl font-semibold text-slate-50">
									{agent.name}
								</h2>
								<p className="mt-2 text-sm text-slate-400">
									{agent.description ?? "No description."}
								</p>
							</Link>
						))
					)}
				</div>
			</div>
		</main>
	);
}
