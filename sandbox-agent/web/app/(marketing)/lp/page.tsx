import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Giselle Agent Sandbox — Fertile Ground for AI Agents",
	description:
		"The runtime where AI agents take root, connect, and yield real output — inside your software.",
};

function Rhizome({ className }: { className?: string }) {
	return (
		// biome-ignore lint/a11y/noSvgWithoutTitle: @todo
		<svg viewBox="0 0 800 400" fill="none" className={className} aria-hidden>
			<g stroke="var(--color-membrane)" strokeWidth="1" opacity="0.4">
				<path d="M 100 350 Q 150 280 200 300 T 320 260 T 400 200" />
				<path d="M 400 200 Q 450 160 520 180 T 650 140" />
				<path d="M 400 200 Q 380 140 420 100 T 500 60" />
				<path d="M 200 300 Q 180 240 220 200 T 300 140" />
				<path d="M 320 260 Q 360 300 420 310 T 540 280" />
				<path d="M 520 180 Q 560 220 620 210 T 720 180" />
				<path d="M 300 140 Q 340 100 400 110 T 500 60" />
				<path d="M 540 280 Q 580 320 650 300 T 750 260" />
			</g>
			<g fill="var(--color-membrane)" opacity="0.3">
				<circle cx="200" cy="300" r="3" />
				<circle cx="320" cy="260" r="4" />
				<circle cx="400" cy="200" r="5" />
				<circle cx="520" cy="180" r="3" />
				<circle cx="300" cy="140" r="3" />
				<circle cx="500" cy="60" r="3" />
				<circle cx="540" cy="280" r="3" />
				<circle cx="650" cy="140" r="4" />
			</g>
		</svg>
	);
}

function SectionLabel({ children }: { children: React.ReactNode }) {
	return (
		<p className="text-root mb-4 text-xs font-medium tracking-[0.2em] uppercase">
			{children}
		</p>
	);
}

function Headline({ children }: { children: React.ReactNode }) {
	return (
		<h2 className="font-[family-name:var(--font-serif)] text-4xl leading-[1.15] tracking-tight md:text-5xl">
			{children}
		</h2>
	);
}

export default function LandingPage() {
	return (
		<main>
			{/* ── Hero ── */}
			<section className="relative overflow-hidden px-6 pt-32 pb-24 md:pt-48 md:pb-36">
				<Rhizome className="pointer-events-none absolute inset-0 h-full w-full" />
				<div className="relative mx-auto max-w-3xl">
					<p className="text-root mb-6 text-sm font-medium tracking-[0.15em] uppercase">
						Giselle Agent Sandbox
					</p>
					<h1 className="font-[family-name:var(--font-serif)] text-5xl leading-[1.08] tracking-tight md:text-7xl">
						Your agents need
						<br />
						ground to grow.
					</h1>
					<p className="text-soil-muted mt-8 max-w-xl text-lg leading-relaxed">
						Agent Sandbox is the runtime where AI agents take root, connect, and
						yield real output&nbsp;&mdash; inside your software.
					</p>
					<div className="mt-10 flex flex-wrap gap-4">
						<a
							href="#playground"
							className="bg-soil text-ground rounded-full px-6 py-3 text-sm font-medium transition hover:opacity-90"
						>
							Try the Playground
						</a>
						<a
							href="#embed"
							className="border-membrane text-soil rounded-full border px-6 py-3 text-sm font-medium transition hover:bg-membrane-light"
						>
							Embed in your app
						</a>
					</div>
				</div>
			</section>

			{/* ── Sow / Tend / Harvest ── */}
			<section className="border-membrane-light border-t px-6 py-24 md:py-36">
				<div className="mx-auto grid max-w-5xl gap-16 md:grid-cols-3 md:gap-12">
					<div>
						<SectionLabel>Sow</SectionLabel>
						<h3 className="font-[family-name:var(--font-serif)] text-2xl leading-snug">
							Plant the seed.
						</h3>
						<p className="text-soil-muted mt-4 leading-relaxed">
							Configure agents with skills, rules, and tools. Single agents or
							multi-agent formations. They&rsquo;re ready to grow.
						</p>
					</div>
					<div>
						<SectionLabel>Tend</SectionLabel>
						<h3 className="font-[family-name:var(--font-serif)] text-2xl leading-snug">
							Watch it grow.
						</h3>
						<p className="text-soil-muted mt-4 leading-relaxed">
							Run in the Playground. See code execute, files form, analyses take
							shape. Not &ldquo;does it work&rdquo; but &ldquo;does it bear
							fruit.&rdquo;
						</p>
					</div>
					<div>
						<SectionLabel>Harvest</SectionLabel>
						<h3 className="font-[family-name:var(--font-serif)] text-2xl leading-snug">
							Yield the output.
						</h3>
						<p className="text-soil-muted mt-4 leading-relaxed">
							Your product&rsquo;s UI on the surface, our runtime beneath the
							soil. Users interact with your interface; execution grows in
							fertile ground below.
						</p>
					</div>
				</div>
			</section>

			{/* ── What Grows ── */}
			<section className="bg-ground-deep px-6 py-24 md:py-36">
				<div className="mx-auto max-w-5xl">
					<SectionLabel>What grows here</SectionLabel>
					<Headline>
						Terminal. File system. Python.
						<br />
						The raw materials agents need.
					</Headline>
					<div className="mt-16 grid gap-10 sm:grid-cols-2 md:gap-14">
						{[
							{
								title: "Coding",
								body: "Implementation, testing, fixes, pull requests. Code that compiles, passes, ships.",
							},
							{
								title: "Analysis",
								body: "Data processing, aggregation, visualization. Numbers become insight, insight becomes decision.",
							},
							{
								title: "Documents",
								body: "Specifications, presentations, summaries. Raw context refined into artifacts your team can use.",
							},
							{
								title: "Vision",
								body: "Images, PDFs, diagrams parsed and transformed. Unstructured input yields structured output.",
							},
						].map((item) => (
							<div key={item.title}>
								<h3 className="font-[family-name:var(--font-serif)] text-xl">
									{item.title}
								</h3>
								<p className="text-soil-muted mt-2 leading-relaxed">
									{item.body}
								</p>
							</div>
						))}
					</div>
				</div>
			</section>

			{/* ── Rhizome ── */}
			<section className="relative px-6 py-24 md:py-36">
				<div className="mx-auto max-w-3xl">
					<SectionLabel>Rhizome</SectionLabel>
					<Headline>
						One agent, one task.
						<br />
						Many agents, emergence.
					</Headline>
					<p className="text-soil-muted mt-8 max-w-xl text-lg leading-relaxed">
						Agents connect laterally&nbsp;&mdash; no rigid hierarchy. An
						orchestrator decomposes, sub-agents grow in parallel, results
						converge. Like roots beneath soil, the network is invisible but the
						yield is real.
					</p>
					<div className="border-membrane-light mt-14 grid gap-px overflow-hidden rounded-2xl border sm:grid-cols-3">
						{[
							{
								pattern: "Plan → Execute → Review",
								desc: "Decompose, act, verify. Quality through division.",
							},
							{
								pattern: "Research | Build | Write",
								desc: "Parallel growth. Three roots, one harvest.",
							},
							{
								pattern: "Specialized tools",
								desc: "Analysis, generation, integration. Each agent tends its own ground.",
							},
						].map((item) => (
							<div key={item.pattern} className="bg-ground-deep p-6 md:p-8">
								<p className="text-root text-sm font-medium">{item.pattern}</p>
								<p className="text-soil-muted mt-2 text-sm leading-relaxed">
									{item.desc}
								</p>
							</div>
						))}
					</div>
				</div>
			</section>

			{/* ── Membrane ── */}
			<section id="embed" className="bg-ground-deep px-6 py-24 md:py-36">
				<div className="mx-auto max-w-3xl">
					<SectionLabel>Membrane</SectionLabel>
					<Headline>The boundary that breathes.</Headline>
					<p className="text-soil-muted mt-8 max-w-xl text-lg leading-relaxed">
						Your product is the surface. Agent Sandbox is the ground beneath.
						The membrane between them lets results flow up while keeping
						execution contained. Not a wall&nbsp;&mdash; a living interface.
					</p>
					<div className="mt-14 space-y-6">
						{[
							{
								context: "Internal tools",
								example:
									"SQL → aggregation → charts → weekly report → slides. One prompt, full harvest.",
							},
							{
								context: "SaaS products",
								example:
									"Isolated sessions per user. Artifacts — CSV, charts, documents — returned through the membrane.",
							},
							{
								context: "Engineering teams",
								example:
									"Issue → decompose → implement → test → release notes. The soil does the tilling.",
							},
						].map((item) => (
							<div
								key={item.context}
								className="border-membrane-light bg-ground rounded-xl border p-6"
							>
								<p className="text-root text-sm font-medium">{item.context}</p>
								<p className="text-soil-muted mt-1 leading-relaxed">
									{item.example}
								</p>
							</div>
						))}
					</div>
				</div>
			</section>

			{/* ── The Soil ── */}
			<section className="px-6 py-24 md:py-36">
				<div className="mx-auto max-w-3xl">
					<SectionLabel>The soil</SectionLabel>
					<Headline>
						Rich soil needs one seed,
						<br />
						not a thousand.
					</Headline>
					<p className="text-soil-muted mt-8 max-w-xl text-lg leading-relaxed">
						What takes 10,000 lines of infrastructure code, Agent Sandbox
						reduces to 10 lines of configuration. The soil is already prepared.
					</p>
					<ul className="text-soil-muted mt-12 space-y-4 text-sm leading-relaxed">
						{[
							"Warm Pool — instant germination. No cold starts.",
							"Snapshot Cache — memory in the soil. Repeated work runs faster.",
							"Session management — perennial, not annual. Long tasks survive.",
							"Security — the membrane's immune system. Allowlists, isolation, escape prevention.",
							"Multi-agent orchestration — mycorrhizal networks, standard.",
						].map((item) => (
							<li key={item} className="border-membrane-light border-l-2 pl-4">
								{item}
							</li>
						))}
					</ul>
				</div>
			</section>

			{/* ── Observability ── */}
			<section className="bg-ground-deep px-6 py-24 md:py-36">
				<div className="mx-auto max-w-3xl">
					<SectionLabel>Observe</SectionLabel>
					<Headline>See what&rsquo;s growing.</Headline>
					<div className="mt-14 grid gap-8 sm:grid-cols-2">
						{[
							{
								name: "Activity Panel",
								desc: "The growth timeline. What's executing, what's waiting, what's done.",
							},
							{
								name: "File Explorer",
								desc: "Browse what emerged. Preview generated artifacts in place.",
							},
							{
								name: "Dispatch Badge",
								desc: "Multi-agent progress at a glance. See the rhizome at work.",
							},
							{
								name: "Streaming Chat",
								desc: "Watch the process unfold. Intermediate output, final yield, one flow.",
							},
						].map((item) => (
							<div key={item.name}>
								<h3 className="text-sm font-medium">{item.name}</h3>
								<p className="text-soil-muted mt-1 text-sm leading-relaxed">
									{item.desc}
								</p>
							</div>
						))}
					</div>
				</div>
			</section>

			{/* ── FAQ ── */}
			<section className="border-membrane-light border-t px-6 py-24 md:py-36">
				<div className="mx-auto max-w-3xl">
					<SectionLabel>Questions</SectionLabel>
					<div className="mt-8 space-y-10">
						{[
							{
								q: "Is this a CLI tool?",
								a: "The CLI is a seed. The runtime beneath — the isolated execution environment — is the ground where work actually happens.",
							},
							{
								q: "Only for coding?",
								a: "Anything that yields output. Analysis, reports, documents, visualizations. If an agent can produce it, this ground can grow it.",
							},
							{
								q: "Why multi-agent?",
								a: "Division and parallel growth. Speed from concurrency, quality from review. Roots that spread wide hold stronger than a single tap root.",
							},
						].map((item) => (
							<div key={item.q}>
								<h3 className="font-medium">{item.q}</h3>
								<p className="text-soil-muted mt-2 leading-relaxed">{item.a}</p>
							</div>
						))}
					</div>
				</div>
			</section>

			{/* ── Final CTA ── */}
			<section className="px-6 py-24 md:py-36">
				<div className="mx-auto max-w-3xl text-center">
					<h2 className="font-[family-name:var(--font-serif)] text-4xl leading-[1.15] tracking-tight md:text-6xl">
						The ground is ready.
					</h2>
					<div className="mt-10 flex flex-wrap justify-center gap-4">
						<a
							href="#playground"
							className="bg-soil text-ground rounded-full px-6 py-3 text-sm font-medium transition hover:opacity-90"
						>
							Try the Playground
						</a>
						<a
							href="#embed"
							className="border-membrane text-soil rounded-full border px-6 py-3 text-sm font-medium transition hover:bg-membrane-light"
						>
							See an embed demo
						</a>
						<a
							href="mailto:support@giselles.ai"
							className="text-soil-muted rounded-full px-6 py-3 text-sm font-medium underline decoration-membrane underline-offset-4 transition hover:text-soil"
						>
							Talk to us
						</a>
					</div>
				</div>
			</section>

			{/* ── Footer ── */}
			<footer className="border-membrane-light text-soil-muted border-t px-6 py-10 text-center text-xs">
				<p>&copy; {new Date().getFullYear()} Giselle</p>
			</footer>
		</main>
	);
}
