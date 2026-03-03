# Phase 2: Polish & Demo Readiness

> **Epic:** [AGENTS.md](./AGENTS.md)
> **Dependencies:** Phase 1 (demo page must be functional)
> **Blocks:** —

## Objective

Add polish to make the demo presentation-ready: suggested prompt chips, loading indicators, a clear/reset button, and a link from the demo index. After this phase, the demo is ready for recording a video or showing to Vercel.

## Deliverables

### 1. Suggested prompt chips

Add clickable prompt suggestions above the chat input. Clicking a chip fills the input field.

**Prompts:**

```ts
const SUGGESTED_PROMPTS = [
  {
    label: "GitHub repo comparison",
    prompt:
      "Compare development velocity of vercel/next.js, facebook/react, and sveltejs/svelte over the past year. Put repo names in the header row, metrics like commits, PRs merged, contributors, and releases in the rows. Also check which coding agents (AGENTS.md, .cursor, .codex) are used.",
  },
  {
    label: "npm download trends",
    prompt:
      "Compare weekly npm downloads for zod, yup, and joi. Put package names in the header row and monthly download counts for the last 6 months in the rows.",
  },
  {
    label: "Language comparison",
    prompt:
      "Fill the spreadsheet with a comparison of Python, JavaScript, and Rust. Header row: language names. Rows: typing system, package manager, typical use cases, GitHub stars of main repo.",
  },
];
```

**UI:** Small pill-shaped buttons, styled like:
```
rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-400
hover:border-slate-500 hover:text-slate-200 transition cursor-pointer
```

### 2. Loading indicator on grid

When chat status is `submitted` or `streaming`:
- Add a subtle animated border to the spreadsheet container (e.g., `border-cyan-500/30 animate-pulse`)
- Or show a small "Agent working…" badge at the top-right of the grid container

When idle, remove the indicator. Keep it simple — one CSS class toggle.

### 3. Clear/reset button

Add a "Clear" button in the page header that:
- Resets all cell values to empty (either re-mount the grid or clear the state)
- Provide a `ref` or callback from `SpreadsheetGrid` to reset state, OR use a `key` prop to force re-mount

```tsx
const [gridKey, setGridKey] = useState(0);
const handleClear = () => setGridKey((k) => k + 1);

<SpreadsheetGrid key={gridKey} rows={10} columns={6} />
```

### 4. Link from `/demos` page

Add a link to the spreadsheet demo in `packages/web/app/demos/page.tsx`:

```tsx
<a
  href="/demo/spreadsheet"
  className="inline-flex rounded-md border border-slate-600 px-3 py-2 text-sm text-slate-200 transition hover:border-cyan-400 hover:text-cyan-200"
>
  Open Spreadsheet Demo
</a>
```

### 5. Page header polish

Update the header area with:
- "Back to home" link (left)
- Agent status badge (right)
- "Clear" button
- Title + subtitle

## Verification

1. **Typecheck:**
   ```bash
   pnpm --filter demo typecheck
   ```

2. **Visual check:**
   ```bash
   pnpm dev
   ```
   Navigate to `http://localhost:3000/demo/spreadsheet`:
   - Suggested prompt chips visible, clicking one fills the input
   - Grid shows loading animation while agent is working
   - "Clear" button resets all cells
   - Navigate to `/demos` — link to spreadsheet demo is present

3. **Demo recording flow:**
   - Click "GitHub repo comparison" chip
   - Send message
   - Watch cells fill up
   - Click "Clear"
   - Try another prompt

4. **Format:**
   ```bash
   pnpm format
   ```

## Files to Create/Modify

| File | Action |
|---|---|
| `packages/web/app/demo/spreadsheet/page.tsx` | **Modify** (add chips, clear button, loading indicator) |
| `packages/web/app/demo/spreadsheet/_components/spreadsheet-grid.tsx` | **Modify** (add loading prop or container styling) |
| `packages/web/app/demos/page.tsx` | **Modify** (add link) |

## Done Criteria

- [ ] Suggested prompt chips render and fill input on click
- [ ] Grid shows loading indicator while agent is working
- [ ] "Clear" button resets all cell values
- [ ] `/demos` page links to `/demo/spreadsheet`
- [ ] Page header shows title, subtitle, status, clear button
- [ ] `pnpm --filter demo typecheck` passes
- [ ] `pnpm format` passes
- [ ] Update the status in [AGENTS.md](./AGENTS.md) to `✅ DONE`
