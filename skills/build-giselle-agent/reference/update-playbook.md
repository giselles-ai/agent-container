# Update Playbook

Use this when the user already has a Giselle Sandbox Agent app and wants to evolve it.

## Principle

Prefer diff-first updates over regeneration.

The intended evolution path is:

1. inspect the current implementation
2. understand the current product story
3. apply the smallest useful file changes
4. verify
5. summarize the delta clearly

## Common update types

### 1. Add artifact downloads

When the app already writes files but does not expose them well:

- make sure outputs go under `./artifacts/`
- surface artifact metadata or download links in the UI
- explain to the user where those files come from

### 2. Add seeded workspace inputs

When the app needs stable starting materials:

- use `defineAgent({ files })`
- place working inputs in `./workspace/` or another clear location
- adjust `agentMd` so the agent knows those files exist

### 3. Add browser tools

When the user wants page interaction:

- add `@giselles-ai/browser-tool`
- add `data-browser-tool-id` to relevant elements
- wire `browserTools` and `useBrowserToolHandler()`
- update `agentMd` to describe the page structure

### 4. Tighten the trust story

When the app works technically but feels opaque:

- show changed files
- show artifact paths
- explain workspace vs artifacts
- explain snapshot continuity in UI or docs

### 5. Extend the same runtime to another surface

When the user wants web plus Slack or a workflow surface:

- preserve the same agent contract
- avoid splitting logic across inconsistent prompts
- extend the product surface without losing the workspace/artifact model

## Update examples to keep in mind

- revise an existing report artifact on the second turn instead of regenerating from zero
- add download links to a file-writing app
- switch from `gemini` to `codex` without breaking the app contract
- add browser-tool visibility to an existing web app

## Sample update prompts

Use prompts like these when you want the coding agent to evolve an existing app instead of rebuilding from scratch.

### 1. Add artifact downloads

```text
Update the existing Giselle Sandbox Agent app so generated files under ./artifacts/ are visible and downloadable from the UI. Do not rebuild the app from scratch. Inspect the current implementation first, make the smallest useful diff, and summarize which files changed.
```

### 2. Add browser-tool support to an existing app

```text
Update this existing Giselle Sandbox Agent app to let the agent inspect and interact with the page using browser tools. Add data-browser-tool-id only where needed, wire the server and client browser-tool paths, and keep the current product structure intact. Explain the diff clearly when you are done.
```

### 3. Turn a chat-only app into a file-oriented app

```text
Update the current agent app so it writes user-facing outputs to ./artifacts/ and makes the file workflow visible in the UI. Keep the existing app shape, but improve the trust story by showing where files live and how a follow-up turn can revise them.
```

### 4. Switch providers without changing the app contract

```text
Change this Giselle Sandbox Agent app from gemini to codex, preserving the existing user-facing behavior and file workflow. Make the smallest safe diff, run the relevant verification, and summarize exactly what changed.
```

## Verification expectations

At minimum, run:

- build
- typecheck
- the most relevant targeted test or smoke path for the change

## Output summary

For update work, always summarize:

- what existed before
- what changed
- how the diff preserves or improves the product story
