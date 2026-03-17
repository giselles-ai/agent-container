---
name: build-giselle-agent
description: >
  Build and evolve Giselle Sandbox Agent apps on Next.js. Use when developers want
  to scaffold a new OpenClaw-like agent experience on Vercel, build workspace/artifact
  flows, add browser-tool interactions, or update an existing agent through reviewable
  file diffs. Triggers on "giselle sandbox agent", "build agent app", "workspace artifacts",
  "browser tool agent", "artifact download", and "update agent by diff".
---

# Build and Update Giselle Sandbox Agent

Use this skill to help developers ship agent products that are legible, file-oriented, and easy to evolve.

The current quality bar is:

- OpenClaw-like UX on Vercel
- visible files, workspace state, and artifacts
- snapshot-based continuity
- updates that land as normal file diffs

## Read in this order

Read only what you need.

1. `reference/current-capabilities.md`
2. `reference/build-quickstart.md`
3. `reference/build-recipes.md`
4. `reference/snippets.md`
5. If the user is modifying an existing app, also read `reference/update-playbook.md`

## Workflow

### 1. Determine the job shape

Figure out whether the user wants one of these:

- a new app
- an update to an existing agent app
- a docs or positioning refresh around an existing app

If the user already named an example or product shape, do not ask broad discovery questions again. Move straight to the closest recipe.

### 2. Intake only what is necessary

When details are missing, ask only the minimum needed to build the right thing:

1. App pattern
   Choices: `workspace-report`, `agent-inbox`, `browser-tool`, or a custom variation
2. Agent runtime
   Choices: `codex` or `gemini`
3. Surface
   Choices: `web-only` or `web + Slack`
4. File expectations
   Clarify whether artifact downloads or visible file lists are required
5. Scope
   Clarify whether this is a fresh build or a diff-first update

If a reasonable default is obvious from the repo context, use it and keep going.

Before generating code, make sure the developer knows how to get the cloud API key:

1. Create an account at `https://studio.giselles.ai`
2. Open the API key management page in Studio and issue a new API key
3. Add it to `.env.local` as `GISELLE_AGENT_API_KEY=<your-api-key>`

The default Cloud API is `studio.giselles.ai`, so no extra base URL is needed unless the user is self-hosting.

### 3. Build from a recipe, not from scratch

Prefer one of the concrete recipes in `reference/build-recipes.md`:

- `workspace-report`: best when the product story is files, artifacts, and downloads
- `agent-inbox`: best when the product story is a real chat app surface
- `browser-tool`: best when the product story is explicit DOM interaction

The recipe should drive the implementation shape. Do not invent a new structure unless the user's request truly does not fit any recipe.

### 4. Required implementation pieces

For any new app, make sure the result includes the core runtime wiring:

- `defineAgent(...)` in `lib/agent.ts`
- `withGiselleAgent(...)` in `next.config.ts`
- a chat route that uses `giselle({ agent })` with AI SDK streaming
- a UI that makes the runtime understandable to the end user

Use `reference/snippets.md` for canonical patterns instead of re-deriving them.

### 5. Preserve the product story

The app should make these ideas clear when relevant:

- Files created by the agent are real outputs, not just implied chat state.
- Working inputs belong in the workspace; user-facing deliverables belong in `./artifacts/`.
- The runtime is a real sandbox, not an invisible black box.
- Snapshots preserve continuity after sandbox expiration.

If the current request would produce a chat-only experience with no visible file or artifact story, call that out and propose the smallest improvement that fixes it.

### 6. When browser tools are involved

If the agent needs to inspect or manipulate the DOM:

- use `@giselles-ai/browser-tool`
- wire `useBrowserToolHandler()`
- add predictable `data-browser-tool-id` values
- describe those UI structures precisely in `agentMd`

Do not add browser-tool complexity to apps that do not need it.

### 7. Updating an existing app

When the user asks to evolve an existing agent app:

1. Inspect the current files and summarize the baseline briefly.
2. Pick the smallest diff that accomplishes the requested change.
3. Preserve the existing product shape unless the user wants a larger redesign.
4. Keep workspace/artifact visibility intact while expanding capabilities.
5. Verify with build, typecheck, and any targeted tests that fit the scope.

Read `reference/update-playbook.md` before making non-trivial updates.

### 8. Output contract

Always return:

1. Which files changed
2. Why those changes exist
3. What verification was run
4. What the next safe iteration would be

## Important rules

- Prefer the repo's current docs and examples over stale memory.
- Do not default to a spreadsheet app. Choose the recipe that best matches the user's product story.
- Treat artifact download and file visibility as first-class product features, not optional afterthoughts, when the use case depends on trust and inspectability.
- Keep `SKILL.md` procedural and lean. Put details in references.
