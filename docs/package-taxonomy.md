# Package Taxonomy

This document is the canonical package naming and boundary reference for `packages/`. Active entries use current package names and paths only.

## Scope

- Covers only `packages/`
- `apps/demo` is a consumer app and is not part of the package taxonomy
- `root/sandbox-agent/` remains deprecated legacy workspace material and is out of scope

## Category Rules

| Category | Meaning |
|---|---|
| `integration` | Framework-specific or build-time integration packages |
| `runtime` | Primitives for running agents in sandbox or container environments |
| `tooling` | Operator-facing CLI or broader agent tooling packages |
| `domain` | Product-domain packages, even when they expose multiple runtime-specific entry points |

## Active Package Inventory

| Canonical Name | Current Path/Name | Category | Primary Runtime(s) | Decision |
|---|---|---|---|---|
| `agent-builder` | `packages/agent-builder` | `integration` | Node / Next.js build | Keep name |
| `agent-runtime` | `packages/agent-runtime` | `runtime` | Node / Vercel Sandbox | Renamed from `sandbox-agent` |
| `agent-kit` | `packages/agent-kit` | `tooling` | Node CLI / agent tooling | Current canonical name |
| `browser-tool` | `packages/browser-tool` | `domain` | browser / React client / Node server / sandbox | Keep as one package |
| `giselle-provider` | `packages/giselle-provider` | `domain` | server / AI SDK provider | Keep name |

## Rename Map

| Current | Canonical Target | Reason |
|---|---|---|
| `sandbox-agent` | `agent-runtime` | The package provides sandbox runtime primitives rather than a generic historical "sandbox agent" bucket |
| `sandbox-agent-kit` | `agent-kit` | The package is growing beyond snapshot assembly, so the canonical name should cover broader agent tooling |
| `agent-snapshot-kit` | `agent-kit` | The narrower snapshot-focused name no longer matches the intended scope |
Clearer responsibility-based names win over compatibility in this realignment. Active docs should switch to the new name as soon as each rename lands.

## Boundary Decision: browser-tool

- Keep `browser-tool` as one package because it owns one domain: browser automation
- Use subpath exports to separate browser, React, relay, and sandbox entry points
- Keep React peer requirements scoped to `@giselles-ai/browser-tool/react`; root, `/dom`, `/relay`, and `/mcp-server` must remain non-React entry points
- Do not split it again unless a new consumer-facing mandatory peer or incompatible install surface becomes a concrete problem

## Historical Docs Policy

- Historical docs may retain old names only when they are clearly labeled historical or deprecated
- Active docs should use canonical names and may mention current pre-rename paths only as transition notes
- Deprecated `root/sandbox-agent/` material should not be treated as part of the active package taxonomy
