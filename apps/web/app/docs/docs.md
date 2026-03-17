# Giselle Sandbox Agent Documentation

Giselle Sandbox Agent is meant for agent experiences that people can inspect inside a real Vercel app.

The docs start from that premise: understand the core shape, use the skill to generate the first version, and evolve it through reviewable diffs instead of opaque chat output.

## Core concepts

The point of this runtime is not just to make an agent work. It is to make the agent legible inside your product: files stay in a workspace, tool behavior can be surfaced in UI, and the changes used to create or update the agent remain visible as code and diffs.

### Features

Like OpenClaw-inspired experiences, the agent can chat, use tools, and return UI. The difference here is deployment shape: you ship it as part of your Vercel app, backed by a real workspace and a runtime people can inspect rather than trust blindly.

- Workspace files and artifacts remain available to inspect.
- Agent updates can land as git-reviewable file diffs.
- One runtime can support web surfaces, workflows, and Slack.
- Structured UI output can be rendered directly in the app.

## First steps

The recommended path is skill-first. Install this repository as a skill, generate the initial agent with that workflow, then use the builder-oriented update flow to keep the implementation easy to review and evolve.

### Getting Started

Start by installing this repository as a local skill. That gives you the intended scaffolding path instead of forcing you to reconstruct the runtime and app structure by hand.

```shell
npx skills add giselles-ai/agent-container
```

- Add the skill to your environment.
- Use the skill flow to create the first sandbox agent.
- Review the generated files before deploying the app on Vercel.

### Update agent

After the first agent exists, switch to the `giselle-agent-sandbox-builder` workflow to evolve it. The important property is not only that the agent changes, but that the change is understandable as files added or modified in git.

- Add new capabilities by editing real files in the workspace.
- Inspect every update as a git diff before you ship it.
- Keep the same agent surface across web and Slack while the implementation evolves.

## Guides

The surrounding notes already point to two guide tracks worth filling out next: a practical assistant setup and a refreshed builder-skill guide that reflects the current implementation.

### Personal Assistant Setup

This guide should walk through creating a personal assistant with a real workspace, reusable tools, and app-rendered UI so the result is useful beyond a demo chat window.

### giselle-agent-sandbox-builder skill

The current skill documentation focuses on initial creation. This guide should explain the update workflow in detail and refresh any stale references so they match the latest runtime and file layout.
