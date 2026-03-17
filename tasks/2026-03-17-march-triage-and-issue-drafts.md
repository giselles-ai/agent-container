# March Triage And Issue Drafts

Date: 2026-03-17
Repo: `giselles-ai/agent-container`

## Current status

- Existing open GitHub issues found: `#5 Extract createBridgeHandler from sandbox-agent-self into agent-core`
- New GitHub issue creation was prepared but not executed because GitHub API access approval was denied in this session.
- The drafts below are ready to paste into `gh issue create` or the GitHub UI.

## March triage

### Must this March

1. Reposition README around the OpenClaw-like on Vercel release story
2. Fix broken onboarding references to `apps/minimum-demo`
3. Align primary getting-started docs with the skill-first Sandbox Agent flow
4. Replace placeholder guide sections in web docs with real guides or remove them
5. Add a concrete example path from landing/docs to file-oriented and diff-first workflows
6. Restore `pnpm build` reliability after the current Turbo panic
7. Security: automate dependency auditing and update monitoring
8. Security: remediate current high-severity production vulnerabilities

### Can wait

1. Normalize product naming across README, docs, and examples
2. Expand the landing page with richer UI proof of workspace/artifact/snapshot behavior
3. Add fuller personal-assistant and Slack-oriented release stories
4. Tighten GitHub Actions hardening with commit SHA pinning
5. Clarify whether examples are release-blocking for security gating or tracked separately

### Skip for this release

1. Exhaustive SDK API documentation expansion
2. Secondary browser-tool feature expansion
3. Package-publishing polish that does not improve message, trust, onboarding, or build reliability

## Security summary

- `pnpm audit --prod --audit-level=critical` result: `26 vulnerabilities found` with `2 low | 15 moderate | 9 high`
- `pnpm audit --prod --json` result reports `critical: 0`
- This satisfies the narrow boss requirement of "no unresolved Critical vulnerabilities" as of 2026-03-17, but it does not mean the repo is in a good security state
- The main production findings currently visible in the audit are:
  - `packages/agent > @vercel/sandbox > undici` high vulnerabilities fixed in `undici >= 7.24.0`
  - `packages/browser-tool > @modelcontextprotocol/sdk > express-rate-limit` high vulnerability fixed in `>= 8.2.2`
  - `packages/browser-tool > @modelcontextprotocol/sdk > @hono/node-server` high vulnerability fixed in `>= 1.19.10`
- There is no CI job for audit, Dependabot, Renovate, or CodeQL under `.github/workflows/`
- `.github/workflows/publish.yml` exists and currently uses action tags rather than commit SHA pinning

## Build summary

- `pnpm build` currently fails on 2026-03-17
- Command output:

```text
> agent-container@0.1.0 build /Users/satoshi/repo/giselles-ai/agent-container
> turbo build

Oops! Turbo has crashed.
```

- Crash report path:
  - `/var/folders/3_/ysyc2q8n295fw82pyn8np1w40000gp/T/report-4e087d58-c875-4fe3-a5ba-62740894dd1e.toml`
- Report details:
  - `crate_version = "2.8.7"`
  - `cause = "Attempted to create a NULL object."`
  - file reference points to `system-configuration-0.6.1/src/dynamic_store.rs:154`

## Issue drafts

### 1. Reposition README around the OpenClaw-like on Vercel release story

**March triage:** Must this March

**Summary**

The root README is still centered on "Giselle Agent SDK" and does not consistently reflect the current release gate: OpenClaw-like agent experiences on Vercel, legible workspace/sandbox behavior, snapshot-based persistence, and reviewable diffs.

**Evidence**

- `README.md:1-26` still leads with SDK framing and contains a remaining TODO
- `README.md:26` points users to a non-existent `./apps/minimum-demo`
- The web landing/docs already use the newer story, so the top-level repo message is split

**Why this matters**

The release gate requires the landing page and primary docs to consistently communicate the direction, and to answer the trust question around files, sandbox state, and snapshots. The README is the first entry point and currently weakens that story.

**Acceptance criteria**

- README leads with the product story: OpenClaw-like on Vercel, inspectable workspace, explicit sandbox, snapshot restore
- README includes a concrete new-user path and a concrete diff-first update path
- README removes the stale TODO and any old positioning that conflicts with the release gate
- README links only to examples/docs that actually exist

### 2. Fix broken onboarding references to `apps/minimum-demo`

**March triage:** Must this March

**Summary**

Several onboarding and example docs still point to `apps/minimum-demo`, but that directory does not exist.

**Evidence**

- `README.md:26`
- `apps/cloud-chat-runner/README.md:3`
- `apps/cloud-chat-runner/app/page.tsx:24`
- `examples/embedded-browser-agent/README.md:1-21`
- `docs/01-getting-started/02-02-building-spreadsheet-agent.md` contains `apps/minimum-demo` references

**Why this matters**

This is a concrete broken path for new users. It directly violates the release gate requirement that the release include a concrete path for a new user to understand how to start.

**Acceptance criteria**

- All references to `apps/minimum-demo` are removed or replaced with the correct example path
- The repo has a single, valid recommended starter example
- Following the docs from README/web/docs lands on real files and runnable instructions

### 3. Align primary getting-started docs with the skill-first Sandbox Agent flow

**March triage:** Must this March

**Summary**

The primary docs are split between the newer skill-first "Giselle Sandbox Agent" story and older SDK-first getting-started content.

**Evidence**

- `apps/web/app/docs/docs.md` presents the current skill-first, OpenClaw-like-on-Vercel positioning
- `docs/01-getting-started/01-01-getting-started.md` still follows the older package-install / browser-tool-first framing

**Why this matters**

The release gate requires the landing page and primary docs to consistently communicate one direction. Right now the product message changes depending on which doc tree a user opens.

**Acceptance criteria**

- There is one clearly recommended getting-started path
- Primary docs consistently explain the workspace/sandbox/snapshot trust model
- Older docs are either updated, explicitly marked as lower-level/reference material, or removed from the main onboarding path
- A new user can follow the primary docs without having to choose between conflicting build approaches

### 4. Replace placeholder guide sections in web docs with real guides or remove them

**March triage:** Must this March

**Summary**

The web docs currently promise guides that do not exist yet and are still written like design notes.

**Evidence**

- `apps/web/app/docs/docs.md:171-196` contains `Personal Assistant Setup` and `Builder skill guide` sections that describe what a guide should cover rather than linking to an implemented guide

**Why this matters**

This creates false affordances in primary docs and weakens the builder/update-flow story required by the release gate.

**Acceptance criteria**

- Each promised guide either exists as real content or is removed from the main docs
- Web docs no longer contain placeholder "This guide should..." copy in user-facing pages
- The update/build flow is represented by an actual doc path, not an aspirational note

### 5. Add a concrete example path from landing/docs to file-oriented and diff-first workflows

**March triage:** Must this March

**Summary**

The landing page and web docs state the right story, but they do not yet prove it with a concrete path to a real example that shows file outputs, downloads, and reviewable diffs.

**Evidence**

- `apps/web/app/page.tsx` strongly emphasizes workspace, sandbox, snapshot, and reviewable diffs
- Current primary CTAs mainly lead to `/docs` and GitHub, not to a concrete example path
- `examples/workspace-report-demo/README.md` is a much stronger proof point for file-oriented value

**Why this matters**

The release gate asks for file-oriented value to be visible in the product story, UI, or docs, and for a concrete path showing how users can start and evolve the implementation through reviewable diffs.

**Acceptance criteria**

- Landing/docs link to a concrete example that shows inspectable files and user-facing artifact output
- The docs explain how to evolve that example through a reviewable diff-first workflow
- A new user can reach a runnable example without guessing which sample is the canonical proof point

### 6. Restore `pnpm build` reliability after the current Turbo panic

**March triage:** Must this March

**Summary**

`pnpm build` currently fails, which blocks the release gate requirement that the web app builds successfully.

**Evidence**

- Reproduced on 2026-03-17 with `pnpm build`
- `turbo` crashes with exit code `101`
- Crash report at `/var/folders/3_/ysyc2q8n295fw82pyn8np1w40000gp/T/report-4e087d58-c875-4fe3-a5ba-62740894dd1e.toml`
- Report points to `system-configuration-0.6.1/src/dynamic_store.rs:154` with `Attempted to create a NULL object.`

**Why this matters**

This is a direct release blocker under the repo release gate.

**Acceptance criteria**

- `pnpm build` succeeds locally in the supported environment
- Root cause is documented, including whether it is a `turbo` bug, environment bug, or repo-specific trigger
- If the issue is upstream, the repo has a temporary workaround or version pin that restores build reliability

### 7. Security: automate dependency auditing and update monitoring

**March triage:** Must this March

**Summary**

The repo currently has no visible automated path for dependency auditing or routine update monitoring.

**Evidence**

- `.github/workflows/` currently only contains `publish.yml`
- No visible audit workflow, Dependabot, Renovate, or CodeQL configuration
- Audit required manual networked execution in this session

**Why this matters**

The current state makes it easy for known vulnerabilities to linger until somebody manually runs an audit. That is too weak for a release baseline.

**Acceptance criteria**

- Add an automated dependency audit path for the workspace
- Fail or alert on Critical vulnerabilities at minimum
- Add automated dependency update monitoring for npm packages and GitHub Actions
- Document the expected response path when an audit fails

### 8. Security: remediate current high-severity production vulnerabilities

**March triage:** Must this March

**Summary**

The current production dependency graph has no Critical findings in `pnpm audit --prod --json`, but it does have several High findings that should be addressed before release if fixes are available.

**Evidence**

- Audit metadata on 2026-03-17 shows `critical: 0`, `high: 9`
- High findings currently include:
  - `packages/agent > @vercel/sandbox > undici`
  - `packages/browser-tool > @modelcontextprotocol/sdk > express-rate-limit`
  - `packages/browser-tool > @modelcontextprotocol/sdk > @hono/node-server`
- `examples/agent-inbox` also pulls in additional vulnerable transitive dependencies

**Why this matters**

The boss requirement only calls out Critical as the minimum bar, but shipping with known High vulnerabilities in production packages is still a clear risk if straightforward updates exist.

**Acceptance criteria**

- Confirm the current audit baseline in a networked environment
- Update direct dependencies where possible so patched transitives are pulled in
- Record any remaining highs that are upstream-blocked, along with mitigation or explicit release acceptance
- Re-run `pnpm audit --prod --json` and attach the before/after summary

## Suggested commands

```bash
pnpm audit --prod --json
pnpm audit -r
pnpm outdated -r
pnpm build
```
