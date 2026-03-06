# Package Taxonomy

This document is the canonical package naming and boundary reference for `packages/`. Active entries use current package names and paths, while not-yet-renamed packages may still appear as transition targets.

## Scope

- Covers only `packages/`
- `apps/demo` is a consumer app and is not part of the package taxonomy
- `root/sandbox-agent/` remains deprecated legacy workspace material and is out of scope

## Category Rules

| Category | Meaning |
|---|---|
| `integration` | Framework-specific or build-time integration packages |
| `runtime` | Primitives for running agents in sandbox or container environments |
| `tooling` | Operator-facing CLI or build tooling packages |
| `domain` | Product-domain packages, even when they expose multiple runtime-specific entry points |

## Active Package Inventory

| Canonical Name | Current Path/Name | Category | Primary Runtime(s) | Decision |
|---|---|---|---|---|
| `agent-builder` | `packages/agent-builder` | `integration` | Node / Next.js build | Keep name |
| `agent-runtime` | `packages/agent-runtime` | `runtime` | Node / Vercel Sandbox | Renamed from `sandbox-agent` |
| `agent-snapshot-kit` | `sandbox-agent-kit` | `tooling` | Node CLI / snapshot build | Rename target from `sandbox-agent-kit` |
| `browser-tool` | `packages/browser-tool` | `domain` | browser / React client / Node server / sandbox | Keep as one package |
| `giselle-provider` | `packages/giselle-provider` | `domain` | server / AI SDK provider | Keep name |

## Rename Map

| Current | Canonical Target | Reason |
|---|---|---|
| `sandbox-agent` | `agent-runtime` | The package provides sandbox runtime primitives rather than a generic historical "sandbox agent" bucket |
| `sandbox-agent-kit` | `agent-snapshot-kit` | The package is snapshot build tooling, so the name should describe that responsibility directly |

Clearer responsibility-based names win over compatibility in this realignment. Active docs should switch to the new name as soon as each rename lands.

## Boundary Decision: browser-tool

- Keep `browser-tool` as one package because it owns one domain: browser automation
- Use subpath exports to separate browser, React, relay, and sandbox entry points
- Do not split it again unless mandatory dependency leakage becomes a concrete install-time problem

## Historical Docs Policy

- Historical docs may retain old names only when they are clearly labeled historical or deprecated
- Active docs should use canonical names and may mention current pre-rename paths only as transition notes
- Deprecated `root/sandbox-agent/` material should not be treated as part of the active package taxonomy
