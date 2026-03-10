# Phase 2: Integration Wiring

> **Epic:** [AGENTS.md](./AGENTS.md)
> **Dependencies:** Phase 0, Phase 1
> **Parallel with:** None
> **Blocks:** None

## Objective

Wire `snapshot.onCreated` in the minimum-demo app's `route.ts` to verify the full end-to-end flow
compiles and the callback shape is ergonomic.

## Deliverables

### 1. `apps/minimum-demo/app/chat/route.ts`

Add the `snapshot` option to the `giselle()` call. For now, just log the snapshot ID
(actual DB persistence is app-specific and outside this epic's scope):

```typescript
const result = streamText({
	model: giselle({
		agent,
		snapshot: {
			onCreated: (snapshotId) => {
				console.log(`[snapshot] new snapshot created: ${snapshotId}`);
			},
		},
	}),
	messages: await convertToModelMessages(messages),
	tools: browserTools,
	providerOptions: {
		giselle: {
			sessionId,
		},
	},
	abortSignal: request.signal,
});
```

## Verification

1. **Typecheck:** `cd apps/minimum-demo && npx tsc --noEmit`
2. **Manual:** Confirm no type errors and the callback shape feels natural for the chat-room use case.

## Files to Create/Modify

| File | Action |
|---|---|
| `apps/minimum-demo/app/chat/route.ts` | **Modify** — add `snapshot.onCreated` to `giselle()` call |

## Done Criteria

- [ ] `giselle({ agent, snapshot: { onCreated } })` compiles without type errors
- [ ] `npx tsc --noEmit` passes in minimum-demo
- [ ] Update the status in [AGENTS.md](./AGENTS.md) to `✅ DONE`
