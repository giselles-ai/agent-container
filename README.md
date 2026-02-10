# AI RPA SDK MVP (Next.js Monorepo)

This repository contains a prototype for AI-driven form automation in a Next.js app.

- `apps/demo`: Next.js demo app with a form + prompt panel
- `packages/rpa-sdk`: Browser-side SDK (`snapshot`, `execute`, React provider/panel)

## Prerequisites

- Node.js 20+
- pnpm 10+
- OpenAI API key

## Setup

```bash
pnpm install
cp apps/demo/.env.example apps/demo/.env.local
# set OPENAI_API_KEY in apps/demo/.env.local
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## How the MVP works

1. Enter instruction and optional document in the prompt panel.
2. Click `Plan`.
3. SDK snapshots form fields from the DOM.
4. `/api/rpa` calls `ai` (`model: "openai/gpt-4o-mini"`) with structured output.
5. Review action plan, then click `Apply`.
6. SDK applies `fill` / `click` / `select` actions to the DOM.

## Manual E2E checks

1. `Fill title and body with a concise summary of the document.` with some document text fills both fields.
2. Add/select instructions to verify `select` action.
3. Use a fake field in instruction and confirm partial apply + warnings.
4. Confirm no DOM changes happen before `Apply`.

## Commands

```bash
pnpm dev
pnpm build
pnpm typecheck
pnpm format
```

## Constraints in this MVP

- No auth / RBAC / audit log
- No streaming partial form fill
- No multi-page automation
- No automatic retry when selector lookup fails
