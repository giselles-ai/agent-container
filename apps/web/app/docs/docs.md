# Giselle Sandbox Agent

Giselle Sandbox Agent is for building **OpenClaw-like agent experiences on Vercel** without turning the product into a black box.

The point is not only that the agent can chat, use tools, and return UI. The point is that the runtime stays legible inside your app: files live in a real workspace, sandbox behavior is understandable, and useful state can survive sandbox expiration through snapshots.

> If you want an agent experience people can try without asking them to trust an unknown local setup, this is the shape.

## Core concepts

This runtime is designed for products where users should be able to understand what happened, not merely receive an answer.

### What makes it different

- It feels like an OpenClaw-style agent experience: chat, tools, browser actions, and app-rendered UI.
- It ships as part of a Vercel app instead of requiring users to install and trust a separate local runtime.
- It gives the agent a real sandbox workspace, so created files and artifacts are not reduced to chat summaries.
- It keeps the implementation legible through normal files, diffs, and app code.

### Trust model

If you are building with Giselle Sandbox Agent, three ideas should stay clear in the product you ship:

1. **Files are visible.** When the agent writes a file, that output exists in the sandbox workspace and can be inspected.
2. **Sandbox execution is explicit.** Tools run in a real environment with files and state, not inside a vague hidden cloud abstraction.
3. **Snapshots preserve continuity.** After a live sandbox expires, the latest useful state can be restored from a snapshot.

### What users should understand

When this product is presented well, a new user should come away with these mental models:

- The agent can create and update files, not just generate text in chat.
- Those files live in a workspace attached to the runtime.
- The workspace is sandboxed, which makes the execution model easier to reason about.
- Snapshots provide a recovery path, so useful output does not disappear when a live sandbox ends.

## First steps

The recommended path is skill-first: install this repository as a skill, then use the `build-giselle-agent` skill through your coding agent.

### Getting started

Install this repository as a skill:

```shell
npx skills add giselles-ai/agent-container
```

Before generating an app, create an account at [studio.giselles.ai](https://studio.giselles.ai), generate an API key, and add it to your project root as:

```env
GISELLE_AGENT_API_KEY=<your-api-key>
```

The Cloud API at `studio.giselles.ai` is the default, so you only need additional base URL configuration if you are self-hosting.

Then ask Codex, Claude Code, Cursor, or whatever coding agent you use to build the app with you by using the `build-giselle-agent` skill.

The point is not to manually explain the whole runtime. The point is to tell the agent what kind of product you want, then let the skill ask for the missing details and choose the right build recipe.

Use prompts like these as starting points.

#### Prompt example: workspace report app

```text
Use the build-giselle-agent skill to build a workspace report app.
I want a Next.js app where the agent reads files from a workspace, writes a report and a highlights file under ./artifacts/, and lets users download those outputs from the UI.
Ask me whatever else you need before you start.
```

#### Prompt example: OpenClaw-like chat app

```text
Use the build-giselle-agent skill to build an OpenClaw-like chat app on Next.js.
I want it to run on Vercel, keep the runtime inspectable, and preserve a clear workspace or artifact story instead of feeling like a black box.
If provider, UI shape, or persistence details are unclear, ask me first.
```

#### Prompt example: browser-tool agent

```text
Use the build-giselle-agent skill to build a browser-tool agent app.
I want the agent to inspect the page, click or fill elements when needed, and keep the app deployable on Vercel.
Only add browser-tool complexity where it is actually necessary, and ask me about any unclear security or provider defaults.
```

#### Prompt example: personal assistant with files

```text
Use the build-giselle-agent skill to build a personal assistant app.
I want a file-oriented agent that can create or update notes, plans, and other outputs in a sandbox workspace, and make those results inspectable in the UI.
Please ask follow-up questions about auth, Slack, downloads, or web-only scope before you implement it.
```

These prompts are intentionally short. The skill should take care of the runtime model, recipe selection, and missing implementation details so you only need to describe the product you want.

### Update flow

After the first version exists, use the same `build-giselle-agent` skill to evolve it.

The point is not to replace the agent blindly. The point is to ask for a concrete change, review the resulting diff, and only build the updated agent after the change looks correct.

Use prompts like these as starting points.

#### Prompt example: add reference files

```text
Use the build-giselle-agent skill to update my existing Giselle Sandbox Agent app.
I want to add more files that the agent can read as references inside the sandbox workspace.
Inspect the current implementation first, make the smallest useful diff, and show me the changes for review before building the updated agent.
```

#### Prompt example: add json-render UI output

```text
Use the build-giselle-agent skill to update my existing Giselle Sandbox Agent app so it can return UI in json-render format.
Keep the current app shape where possible, add only the wiring that is needed, and show me the diff before building the updated agent.
```

#### Prompt example: let the agent run Go

```text
Use the build-giselle-agent skill to update my existing Giselle Sandbox Agent app so the agent can execute Go code inside the sandbox.
Please add whatever setup is required in the agent configuration or sandbox build path, keep the change reviewable, and show me the diff before building the updated agent.
```

#### Review before build

When you use the skill for updates, the recommended flow is:

1. ask for the capability you want
2. let the skill inspect the current implementation
3. review the resulting file diff
4. if the change looks good, build the updated agent

This keeps the update process understandable. The app does not get silently replaced. You can review the exact file changes first, then decide whether to ship them.

## File and persistence model

If you are building on top of this runtime, explain it in file terms, not only in model terms.

### File creation

If the agent creates a file, that file should be treated as part of the product experience. It is not merely a hidden intermediate. The right story is:

- the agent can write files in the sandbox workspace
- those files can be inspected and reused
- those files make the runtime easier to trust because output is materialized

### Workspace persistence

The sandbox workspace is where the agent's practical output lives during execution. This is the foundation for experiences where users want something more than a transient answer.

Typical examples:

- a generated plan in markdown
- a draft specification
- code changes prepared for review
- exported data or research notes

### Snapshot restore

After an interaction completes, the system can create a snapshot of the latest useful state. That means sandbox expiration does not have to mean total loss.

The important product message is simple:

- the live sandbox may expire
- the work does not have to disappear with it
- snapshots provide the restore path

## Guides

If you are using Giselle Sandbox Agent as a builder, these are the next guide tracks that matter after the core concepts and first setup.

### Personal Assistant Setup

This guide should walk through building a practical assistant with:

- a real workspace
- reusable tools
- visible files and artifacts
- app-rendered UI
- a persistence story users can trust

The goal is not to demo chat. The goal is to help builders create an assistant that produces work people can keep.

### Builder skill guide

This guide should explain how builders can evolve an already-generated agent using a builder-oriented workflow.

It should cover:

- how to inspect the current workspace
- how to add capabilities through normal files
- how to review changes as git diffs
- how to keep the runtime and product story aligned as the implementation grows
