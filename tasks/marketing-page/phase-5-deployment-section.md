# Phase 5: Deployment & Cloud Section

> **Epic:** [AGENTS.md](./AGENTS.md)
> **Dependencies:** Phase 1 (marketing narrative), Phase 4 (demo chat)
> **Parallel with:** None
> **Blocks:** None

## Objective

Add a "Get Started" section at the bottom of the marketing page with a self-host path and a Cloud path. Following the narrative principle "Expand Autonomy", self-hosting is shown first to respect the reader's independence — then Cloud is introduced as a convenience, not a requirement.

## Why This Order Matters (from Discussion #5353)

> Not "Cloud only" but "you can do it yourself, and there's also an easier path" — this structure builds trust.

1. **First, show that self-hosting is possible** — respect autonomy
2. **Honestly list what's needed (Redis, Sandbox, API keys)** — disclose limitations
3. **Then introduce Cloud as the easy option** — natural expansion of choice

## Deliverables

### 1. `packages/web/app/page.tsx` — **Modify**

Add the deployment section after Act 3.

#### Section Layout

```
── Get Started ──────────────────────────

Open source. Self-host or use Cloud.

┌─ Self-Host ─────────────────────────┐
│                                     │
│  ▲ Deploy to Vercel                 │
│                                     │
│  You'll need:                       │
│  • Vercel account (Sandbox access)  │
│  • Redis (Upstash or self-hosted)   │
│  • Gemini API key or OpenAI key     │
│                                     │
│  npm install @giselles-ai/giselle-provider
│              @giselles-ai/browser-tool
│              @giselles-ai/sandbox-agent
│                                     │
└─────────────────────────────────────┘

┌─ Cloud ─────────────────────────────┐
│                                     │
│  Or let us handle the infra.        │
│                                     │
│  Giselle Cloud manages Sandbox,     │
│  Redis, and agent orchestration.    │
│  You just write the 20 lines.      │
│                                     │
│  [Get Started with Cloud →]         │
│                                     │
└─────────────────────────────────────┘

── Footer ───────────────────────────────

Apache-2.0 · GitHub · Docs
```

#### Deploy to Vercel Button

```tsx
<a
	href="https://vercel.com/new/clone?repository-url=https://github.com/giselles-ai/agent-container"
	target="_blank"
	rel="noopener noreferrer"
	className="inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-slate-200"
>
	▲ Deploy to Vercel
</a>
```

#### npm install Command

Show all 3 packages in a copyable code block:

```tsx
<pre className="mt-4 rounded-lg border border-slate-700 bg-slate-950 p-4 text-sm text-slate-300">
	npm install @giselles-ai/giselle-provider \
	            @giselles-ai/browser-tool \
	            @giselles-ai/sandbox-agent
</pre>
```

#### Cloud CTA

Keep it understated. Frame Cloud as convenience, not superiority:

```tsx
<a
	href="https://studio.giselles.ai"
	className="inline-flex rounded-md border border-cyan-400 px-4 py-2 text-sm text-cyan-200 transition hover:bg-cyan-400/10"
>
	Get Started with Cloud →
</a>
```

### 2. Footer

A minimal footer at the page bottom:

```tsx
<footer className="mt-32 border-t border-slate-800 py-8 text-center text-xs text-slate-500">
	<p>
		Apache-2.0 ·{" "}
		<a href="https://github.com/giselles-ai/agent-container" className="hover:text-slate-300">
			GitHub
		</a>{" "}
		·{" "}
		<a href="https://github.com/giselles-ai/agent-container/blob/main/docs/getting-started.md" className="hover:text-slate-300">
			Docs
		</a>
	</p>
</footer>
```

## Verification

1. **Build check:**
   ```bash
   cd packages/web && pnpm build
   ```

2. **Typecheck:**
   ```bash
   cd packages/web && pnpm typecheck
   ```

3. **Manual verification:**
   - `/` → "Get Started" section appears at the bottom of the page
   - Self-Host card contains Deploy to Vercel button
   - npm install command is displayed
   - Cloud card contains a CTA
   - Footer shows license, GitHub, and Docs links
   - Deploy to Vercel button points to the correct URL
   - Cloud CTA points to `https://studio.giselles.ai`
   - Scroll experience is smooth; no sections feel too dense

4. **Narrative evaluation:**
   - Illich Test: is the self-host option presented before Cloud?
   - Does the reader feel "I could do this myself" before learning about Cloud?
   - Are requirements honestly listed (limitation disclosure)?

## Files to Create/Modify

| File | Action |
|---|---|
| `packages/web/app/page.tsx` | **Modify** (add deployment section + footer) |

## Done Criteria

- [ ] Self-Host section has a Deploy to Vercel button
- [ ] npm install command is displayed in a copyable format
- [ ] Infrastructure requirements are listed
- [ ] Cloud section has a CTA
- [ ] Self-host appears before Cloud
- [ ] Footer has license, GitHub, and Docs links
- [ ] `pnpm build` and `pnpm typecheck` pass
- [ ] Update the status in [AGENTS.md](./AGENTS.md) to `✅ DONE`
