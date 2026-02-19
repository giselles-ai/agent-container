import { sanitizeNextPath } from "@/lib/protection";

type SearchParamValue = string | string[] | undefined;
type SearchParamsShape = Record<string, SearchParamValue>;

function firstValue(value: SearchParamValue): string | undefined {
	return Array.isArray(value) ? value[0] : value;
}

export default async function GiselleProtectionPage({
	searchParams,
}: {
	searchParams?: Promise<SearchParamsShape>;
}) {
	const resolvedParams = (await searchParams) ?? {};
	const hasError = firstValue(resolvedParams.error) === "1";
	const nextPath = sanitizeNextPath(firstValue(resolvedParams.next));

	return (
		<main className="min-h-screen bg-slate-950 p-6 text-slate-100 sm:p-10">
			<div className="mx-auto max-w-md rounded-2xl border border-slate-800 bg-slate-900/90 p-6 shadow-2xl">
				<p className="text-xs uppercase tracking-[0.16em] text-cyan-300">
					Giselle Protection
				</p>
				<h1 className="mt-2 text-2xl font-semibold">Enter Password</h1>
				<p className="mt-2 text-sm text-slate-300">
					This app is protected. Enter the shared password to continue.
				</p>

				{hasError ? (
					<p className="mt-4 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
						Password is incorrect.
					</p>
				) : null}

				<form
					className="mt-5 space-y-4"
					method="post"
					action="/api/giselle-protection/login"
				>
					<input type="hidden" name="next" value={nextPath} />
					<label className="block">
						<span className="mb-1 block text-xs uppercase tracking-[0.12em] text-slate-400">
							Password
						</span>
						<input
							type="password"
							name="password"
							required
							autoComplete="current-password"
							className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400"
						/>
					</label>
					<button
						type="submit"
						className="w-full rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
					>
						Continue
					</button>
				</form>
			</div>
		</main>
	);
}
