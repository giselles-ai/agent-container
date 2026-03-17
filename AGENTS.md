# AGENTS.md

Instructions for AI coding agents working with this codebase.

<!-- opensrc:start -->

## Source Code Reference

Source code for dependencies is available in `opensrc/` for deeper understanding of implementation details.

See `opensrc/sources.json` for the list of available packages and their versions.

Use this source code when you need to understand how a package works internally, not just its types/interface.

### Fetching Additional Source Code

To fetch source code for a package or repository you need to understand, run:

```bash
npx opensrc <package>           # npm package (e.g., npx opensrc zod)
npx opensrc pypi:<package>      # Python package (e.g., npx opensrc pypi:requests)
npx opensrc crates:<package>    # Rust crate (e.g., npx opensrc crates:serde)
npx opensrc <owner>/<repo>      # GitHub repo (e.g., npx opensrc vercel/ai)
```

<!-- opensrc:end -->

## Release Gate

This repository's current release goal is not "ship every capability." The goal is to make the product legible as an OpenClaw-like agent experience running on Vercel, with a visible workspace and understandable persistence model.

Before proposing or approving a release, agents should evaluate the work against the following gate.

### Core Message

The release must make these points clear:

- This is an OpenClaw-like agent experience running on Vercel.
- It is not a black box: the user can understand the runtime through files, sandbox state, and snapshots.
- It feels practically usable, not only technically impressive.

### Required Release Conditions

A release is ready only if all of the following are true:

1. The landing page and primary docs consistently communicate the direction as "OpenClaw-like agent experiences on Vercel."
2. The product clearly answers the trust question: users should understand that the system exposes real files, a real sandboxed workspace, and snapshot-based persistence rather than hiding everything behind chat output.
3. File-oriented value is visible in the product story, UI, or docs. At minimum, users should be able to understand that:
   - agents can create files in the sandbox
   - those files are retained in the sandbox workspace
   - snapshots are created so work can be restored after sandbox expiration
4. The release includes a concrete path for a new user to understand how to start and how to evolve an agent implementation through reviewable file diffs.
5. The web app builds successfully, and the release story shown in the app matches the intended market message.

### Preferred Conditions

These are not strict blockers, but they strongly improve release quality:

- Users can download or otherwise retrieve files created in the sandbox.
- The docs include both an initial setup path and a builder/update path.
- The product demonstrates ordinary, legible file workflows rather than only abstract agent claims.

### Prioritization Rules

When tradeoffs are necessary, prioritize work in this order:

1. Clarify the top-level message and positioning.
2. Improve how file system behavior, sandbox state, and snapshots are shown.
3. Tighten the onboarding and update-flow documentation.
4. Expand secondary features.
5. Package-publishing polish that does not materially help the above story.

### Non-Goals For This Release

The following should not delay release unless they block the core message above:

- Exhaustive explanation of the full SDK surface area
- Broad feature expansion unrelated to the OpenClaw-like story
- Package release perfection when the main goal is attention and product understanding

### Agent Guidance

When asked whether the project is ready to release, answer against this gate first. Do not default to generic engineering completeness. If the core story is unclear, if the file/sandbox/snapshot value is not visible, or if the docs do not explain the intended path, the release should be considered not ready even if the code builds.
