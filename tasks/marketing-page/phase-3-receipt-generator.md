# Phase 3: Demo Receipt Generator

> **Epic:** [AGENTS.md](./AGENTS.md)
> **Dependencies:** Phase 2 (expense form)
> **Parallel with:** None
> **Blocks:** Phase 4 (demo chat integration)

## Objective

Add a demo receipt generation feature to the chat panel area. Users select services (OpenAI, Anthropic, etc.) and click "Generate" to create realistic invoice data with randomized amounts, dates, and invoice numbers. This data becomes the context for the AI chat in Phase 4.

## Why This Matters (from Discussion #5353)

- Preset demo data feels staged — "of course it works with your own data"
- Asking users to upload a real PDF causes drop-off — "I don't have one handy"
- Choosing a service they actually pay for makes it personal
- Varying content per selection eliminates the staged feel

## Deliverables

### 1. Receipt Data Type and Generation Logic

Define inline in `packages/web/app/demo/page.tsx` (no separate file needed).

#### Type Definition

```ts
type DemoReceipt = {
	service: string;
	invoiceNumber: string;
	date: string;         // YYYY-MM-DD
	amount: number;
	currency: string;
	description: string;  // e.g., "API Usage — February 2026"
};
```

#### Per-Service Generation Parameters

| Service | Amount Range | Description Template |
|---|---|---|
| OpenAI | $100–$500 | "API Usage — {month} {year}" |
| Anthropic | $80–$400 | "Claude API — {month} {year}" |
| Vercel | $20–$200 | "Pro Plan + Usage — {month} {year}" |
| Google Cloud | $150–$800 | "Cloud Platform — {month} {year}" |
| GitHub | $4–$21 | "GitHub Copilot — {month} {year}" |

#### Generation Logic

```ts
function generateReceipt(serviceId: string): DemoReceipt {
	// 1. Look up service config (amount range, description template)
	// 2. Randomize amount within range (2 decimal places)
	// 3. Pick a random date within the current month (1st through today)
	// 4. Generate unique invoice number in INV-XXXXX format (Math.random based)
	// 5. Fill description template with current month and year
}
```

### 2. Replace Chat Placeholder with Receipt Generation UI

Replace the Phase 2 chat placeholder with the receipt generation interface:

```
┌──────────────────────────┐
│  💬 AI Assistant          │
│                          │
│  Upload a receipt, or    │
│  generate a demo one:    │
│                          │
│  ☑ OpenAI                │
│  ☑ Anthropic             │
│  ☐ Vercel                │
│  ☐ Google Cloud          │
│  ☐ GitHub                │
│                          │
│         [Generate]       │
│                          │
│  ── generated receipts ──│
│                          │
│  📄 OpenAI Invoice       │
│     Feb 2026 — $240.00   │
│     INV-48271             │
│                          │
│  📄 Anthropic Invoice    │
│     Feb 2026 — $180.50   │
│     INV-93045             │
│                          │
│  ── chat input ──────────│
│  [  Fill it in for me  ] │
│  (enabled in Phase 4)    │
│                          │
└──────────────────────────┘
```

#### UI Components

- Service selection: checkbox list (multi-select, OpenAI and Anthropic checked by default)
- "Generate" button: creates receipts for all checked services
- Generated receipt cards: display service name, month, amount, invoice number
- Receipts managed via `useState<DemoReceipt[]>`

### 3. Receipt Card Design

Each receipt is displayed as a compact card:

```tsx
<div className="rounded-lg border border-slate-700 bg-slate-900/70 p-3">
	<div className="flex items-center gap-2">
		<span className="text-sm">📄</span>
		<span className="text-sm font-medium text-slate-100">
			{receipt.service} Invoice
		</span>
	</div>
	<p className="mt-1 text-xs text-slate-400">
		{receipt.description}
	</p>
	<p className="mt-1 text-sm font-medium text-slate-200">
		${receipt.amount.toFixed(2)}
	</p>
	<p className="mt-1 text-xs text-slate-500">
		{receipt.invoiceNumber}
	</p>
</div>
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
   - Navigate to `/demo`
   - Check services and click "Generate" → receipt cards appear
   - Amounts are within the expected range for each service
   - Invoice numbers follow `INV-XXXXX` format
   - Dates fall within the current month
   - Clicking "Generate" again produces different amounts and numbers
   - Changing checked services and regenerating only produces selected ones

## Files to Create/Modify

| File | Action |
|---|---|
| `packages/web/app/demo/page.tsx` | **Modify** (chat placeholder → receipt generation UI) |

## Done Criteria

- [ ] Service selection checkboxes are displayed
- [ ] "Generate" button creates receipt data
- [ ] Generated amounts are within per-service ranges
- [ ] Invoice numbers are unique
- [ ] Dates are within the current month
- [ ] Multiple generations produce different data
- [ ] `pnpm build` and `pnpm typecheck` pass
- [ ] Update the status in [AGENTS.md](./AGENTS.md) to `✅ DONE`
