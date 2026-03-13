# Phase 4: Remove Legacy Custom Tags

> **Epic:** [AGENTS.md](./AGENTS.md)
> **Dependencies:** Phase 3 (json-render rendering confirmed working)
> **Parallel with:** None

## Objective

Remove the legacy custom HTML tag components (StepIndicator, Callout, BarChart, LineChart, PieChart) and their Streamdown `allowedTags`/`components` configuration from `chat-message.tsx`. After this phase, all rich UI rendering goes through json-render exclusively.

## What You're Building

This is a cleanup phase. No new functionality — only removal of dead code.

## Deliverables

### 1. `apps/chat-app/app/(main)/chats/chat-message.tsx` — Remove custom tag components

**Remove** the following component definitions entirely:
- `StepIndicator` function (lines 8–31)
- `Callout` function (lines 33–60)
- `DEFAULT_COLORS` constant (lines 62–71)
- `ChartProps` type (line 73)
- `parseChartData` function (lines 75–112)
- `BarChart` function (lines 114–184)
- `LineChart` function (lines 186–291)
- `PieChart` function (lines 293–362)

**Simplify** the `ChatMessage` component's Streamdown usage — remove `allowedTags` and `components` props:

**Before:**
```tsx
<Streamdown
	key={id}
	plugins={{ code } as PluginConfig}
	allowedTags={{
		step: ["status"],
		callout: ["type"],
		"bar-chart": ["data*"],
		"line-chart": ["data*"],
		"pie-chart": ["data*"],
	}}
	components={{
		step: StepIndicator,
		callout: Callout,
		"bar-chart": BarChart,
		"line-chart": LineChart,
		"pie-chart": PieChart,
	}}
	isAnimating={isStreaming}
>
	{text}
</Streamdown>
```

**After:**
```tsx
<Streamdown
	key={id}
	plugins={{ code } as PluginConfig}
	isAnimating={isStreaming}
>
	{text}
</Streamdown>
```

The `ToolInvocationDisplay` component and `ChatMessage` component remain — only the custom tag infrastructure is removed.

### 2. Verify no remaining references

Search the codebase for any remaining imports or references to the removed components:

```bash
pnpm exec grep -r "StepIndicator\|parseChartData\|ChartProps\|allowedTags\|bar-chart\|line-chart\|pie-chart" apps/chat-app/app/ --include="*.tsx" --include="*.ts"
```

This should return no matches (except possibly in test files if any exist).

## Verification

1. **Typecheck:** `pnpm --filter chat-app typecheck` passes
2. **Build:** `pnpm --filter chat-app build` succeeds
3. **Lint:** `pnpm --filter chat-app lint` passes (no unused imports/variables)
4. **Manual test:** Start dev server, verify:
   - Regular text messages render correctly
   - AI-generated charts render via json-render (not custom tags)
   - No console errors

## Files to Create/Modify

| File | Action |
|---|---|
| `apps/chat-app/app/(main)/chats/chat-message.tsx` | **Modify** (remove ~300 lines of custom tag components, simplify Streamdown props) |

## Done Criteria

- [ ] StepIndicator, Callout, BarChart, LineChart, PieChart components removed
- [ ] parseChartData, ChartProps, DEFAULT_COLORS removed
- [ ] Streamdown no longer has `allowedTags` or `components` props
- [ ] No grep matches for removed component names in chat-app source
- [ ] `pnpm --filter chat-app typecheck` passes
- [ ] `pnpm --filter chat-app build` succeeds
- [ ] Update the status in [AGENTS.md](./AGENTS.md) to `✅ DONE`
