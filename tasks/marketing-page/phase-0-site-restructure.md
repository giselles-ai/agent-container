# Phase 0: Site Restructure

> **Epic:** [AGENTS.md](./AGENTS.md)
> **Dependencies:** None
> **Parallel with:** None
> **Blocks:** Phase 1, Phase 2

## Objective

Move the current `/` page (demo index) to `/demos` and claim `/` for the marketing page. All existing demo page links remain functional.

## Deliverables

### 1. `packages/web/app/demos/page.tsx` — **Create**

Move the current `packages/web/app/page.tsx` content here verbatim. No changes needed to the component itself.

### 2. `packages/web/app/page.tsx` — **Modify**

Replace with a minimal marketing skeleton. Phase 1 will fill in the real narrative content:

```tsx
export default function MarketingPage() {
	return (
		<main className="min-h-screen p-6 text-slate-100 sm:p-10">
			<section className="mx-auto max-w-4xl">
				<h1 className="text-4xl font-semibold">
					AI agents that act, not just talk.
				</h1>
				<p className="mt-4 text-lg text-slate-300">
					Bring CLI agent superpowers into your app — through the AI SDK you
					already use.
				</p>
				<div className="mt-8">
					<a
						href="/demo"
						className="inline-flex rounded-md border border-cyan-400 px-4 py-2 text-sm text-cyan-200 transition hover:bg-cyan-400/10"
					>
						Try the Demo
					</a>
					<a
						href="/demos"
						className="ml-3 inline-flex rounded-md border border-slate-600 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-400"
					>
						Developer Demos
					</a>
				</div>
			</section>
		</main>
	);
}
```

### 3. `packages/web/app/layout.tsx` — **Modify**

Update the metadata:

```tsx
export const metadata: Metadata = {
	title: "Giselle Agent SDK — AI agents that act, not just talk",
	description:
		"Bring CLI agent superpowers into your Next.js app through the AI SDK you already use. Open source.",
};
```

### 4. Existing demo page links — **No changes needed**

The `href="/"` links in `gemini-browser-tool/page.tsx` and `codex-browser-tool/page.tsx` will now point to the marketing page, which is a natural navigation path. A `/demos` link can be added later if needed.

## Verification

1. **Build check:**
   ```bash
   cd packages/web && pnpm build
   ```

2. **Manual verification:**
   - `/` → marketing skeleton is displayed
   - `/demos` → old home page (demo index) is displayed
   - `/gemini-browser-tool` → existing demo works normally
   - `/codex-browser-tool` → existing demo works normally
   - `/demo` → 404 (will be created in Phase 2)

## Files to Create/Modify

| File | Action |
|---|---|
| `packages/web/app/demos/page.tsx` | **Create** (old page.tsx content moved here) |
| `packages/web/app/page.tsx` | **Modify** (replace with marketing skeleton) |
| `packages/web/app/layout.tsx` | **Modify** (update metadata) |

## Done Criteria

- [ ] `/demos/page.tsx` contains the old home page content
- [ ] `/page.tsx` has the marketing skeleton
- [ ] `layout.tsx` metadata is updated
- [ ] `pnpm build` succeeds
- [ ] Existing demo pages are not broken
- [ ] Update the status in [AGENTS.md](./AGENTS.md) to `✅ DONE`
