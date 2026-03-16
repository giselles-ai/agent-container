# AGENTS.md

## Project Direction

- This repo is currently being positioned as a Vercel-native way to build `OpenClaw-like` agent experiences.
- Important: say `OpenClaw-like` or `OpenClaw-style`, not `OpenClaw on Vercel`. The claim is not that OpenClaw itself runs here; the claim is that similar product UX can be built on this stack.
- The current key message is:
  - `Build OpenClaw-like agent experiences on Vercel.`
- The strongest supporting message right now is:
  - bring the local filesystem-based agent workflow to the cloud
  - give the agent a real cloud-side workspace, not just a chat box
  - let agents read/write files, run commands, and act through tools inside Vercel Sandbox

## Current Messaging Focus

- This direction appears to resonate because it gives non-experts a simple mental model for what Sandbox Agent is trying to become.
- The main remaining work is sharpening:
  - the headline / sub-copy
  - the feature grouping under that story
  - the filesystem/workspace explanation

## Filesystem / Workspace Story

- This is currently the most strategically important part of the story.
- The intended framing is:
  - the agent has a real workspace in the cloud
  - the local-computer mental model can move into a cloud product
  - this is closer to the OpenClaw mental model than a plain chatbot

### What we can already say

- Agents run in Vercel Sandbox with an isolated workspace.
- When an agent creates files during execution, those files live in the sandbox workspace.
- Snapshot/expire recovery exists at least conceptually in the product direction, and recent work in the repo is aligned with restoring from the latest snapshot after sandbox expiry.
- Browser actions, command execution, and file operations are all part of the same agent runtime story.

### What we should be careful about

- Avoid implying a fully solved, globally shared personal filesystem unless it truly exists in-product.
- The likely near-term product is not "magic shared storage everywhere", but a more explicit and constrained model:
  - build an agent
  - update that agent
  - keep the agent's working environment understandable
- The current internal preference is to avoid a vague "everything syncs everywhere" story that becomes hard to reason about.

### Product discussion notes

- Files created by the agent are automatically stored in the sandbox while the agent runs there.
- Uploading local user files into the agent workspace currently depends on the app surface and is not yet the main message.
- Downloading files from the sandbox should be exposed via API / message protocol so each client can decide its own UX.
- A good product direction is to make the agent lifecycle legible:
  - `/build-agent-skill` creates/builds the agent
  - `/update-agent-skill` updates and rebuilds it
  - keep the tutorial short and concrete rather than writing a long conceptual document

## Landing Page Guidance

- The landing page work currently lives in `apps/web`.
- Current messaging priorities:
  1. OpenClaw-like cloud agent UX
  2. cloud workspace / filesystem
  3. structured UI, browser actions, and cross-channel surfaces
- The page should feel broad and exciting, not like a single-feature RPA site.
- Keep `Automate the app you already built` as one capability among several, not the sole centerpiece.
- The preferred four surface buckets are:
  - `Inbox-style agent console`
  - `Return UI, not just text`
  - `Automate the app you already built`
  - `Use the same agent from web chat or Slack`

## Repo Proof Points

- `apps/minimum-demo`
  - strongest proof for product-embedded browser automation
  - demonstrates code-level instrumentation with `data-browser-tool-id`
- `apps/chat-app`
  - strongest proof for chat-native product surfaces and Slack continuity
- `apps/web`
  - marketing / docs site that packages the story above

## How to Talk About It

- Good:
  - `Build OpenClaw-like agent experiences on Vercel.`
  - `Bring the local agent workflow to the cloud.`
  - `Give your cloud agent a real workspace.`
- Avoid:
  - `Run OpenClaw on Vercel`
  - `OpenClaw on Vercel`
  - claims that imply a finished universal shared filesystem unless that is explicitly implemented
