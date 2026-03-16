import Image from "next/image";
import Link from "next/link";
import { ButtonLink } from "../components/button-link";

const todayCapabilities = [
	{
		title: "Build as Next.js app",
		copy: "Create the runtime at build time, then deploy it on Vercel with the rest of your product.",
	},
	{
		title: "Cloud workspace",
		copy: "Files, artifacts, and revisions live inside Vercel Sandbox instead of disappearing into a chat thread.",
	},
	{
		title: "Power of CLI",
		copy: "Bridge agent runtimes like Codex CLI or Gemini CLI into a Vercel-native app surface.",
	},
	{
		title: "Embed in real product",
		copy: "Drive browser actions in real product flows, not just in a detached demo tab.",
	},
	{
		title: "Return UI, not just text",
		copy: "Stream structured payloads so your app can render state, actions, and artifacts directly.",
	},
	{
		title: "Not just web",
		copy: "Keep one runtime across inbox-style chat, team workflows, and other chat-native surfaces.",
	},
] satisfies Array<{
	title: string;
	copy: string;
}>;

export default function HomePage() {
	return (
		<main className="min-h-screen">
			<header className="sticky top-0 z-20">
				<div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
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
				<div className="mx-auto max-w-5xl text-center">
					<div className="flex flex-col items-center">
						{/*<p className="fade-up font-mono text-[11px] uppercase tracking-[0.34em] text-muted">
							Giselle Sandbox Agent API
						</p>*/}
						<h1 className="fade-up fade-up-delay mt-5 max-w-4xl text-4xl leading-[0.95] tracking-[-0.05em] text-text sm:text-7xl">
							Build OpenClaw-like agent experiences on Vercel
						</h1>

						<p className="fade-up fade-up-delay-2 mt-5 max-w-3xl leading-7 text-muted">
							Read and revise files, generate reports and JSON artifacts, drive
							browser actions inside your app, render structured UI, and
							continue the same agent from web chat or Slack
						</p>
						<div className="mt-9 flex flex-wrap items-center gap-3">
							<ButtonLink href="/docs" variant="solid">
								Get started
							</ButtonLink>
							<ButtonLink
								href="https://nextjs.org/docs"
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

			<section id="today" className="px-5 py-20">
				<div className="mx-auto max-w-7xl">
					<div className="flex justify-center gap-4 text-center text-xl">
						<p className="font-bold text-text">What It Does</p>
						<p className="text-muted">
							Everything you need to build great Agents on top of the Vercel.
						</p>
					</div>
					<div className="mt-10 grid gap-x-0 gap-y-0 grid-cols-2 grid-cols-3">
						{todayCapabilities.map((item) => {
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
		</main>
	);
}
