---
name: writing-task-plans
description: "Writes structured task plans (epics with phased sub-tasks) in the tasks/ directory. Use when asked to plan, break down, or write tasks for a feature, migration, or refactor."
---

# Writing Task Plans

Creates structured, agent-executable task plans following the proven pattern in `tasks/`.

## Output Structure

```
tasks/{epic-slug}/
├── AGENTS.md                  ← Epic overview (the "map")
├── phase-0-{name}.md          ← First sub-task
├── phase-1-{name}.md          ← Second sub-task
├── ...
└── phase-N-{name}.md          ← Final sub-task
```

## Step 1: Research Before Writing

Before writing any task files, deeply understand:

1. **Existing code** — Read all files that will be modified or referenced. Never write tasks about code you haven't read.
2. **Conventions** — Check `package.json`, `tsconfig.json`, build tools, linting, and folder structure of the project.
3. **Dependencies** — Identify library versions, internal packages, and shared patterns.
4. **The "Why"** — Understand the motivation. Ask the user if unclear.

## Step 2: Write `AGENTS.md` (Epic Overview)

This is the single source of truth. It must contain ALL of the following sections:

### Required Sections

```markdown
# Epic: {Title}

> **GitHub Epic:** #{number} · **Sub-issues:** #{start}–#{end} (Phases 0–N)

## Goal

One paragraph: what the codebase looks like AFTER this epic is complete.

## Why

Why the current approach is insufficient. What benefits the new approach brings.
Use a bullet list for concrete benefits.

## Architecture Overview

A mermaid diagram (sequenceDiagram or flowchart) showing the end-state architecture.
Include all major components and their interactions.

## Package / Directory Structure

Show the relevant directory tree with annotations:
- Which directories/files are NEW
- Which are EXISTING (modified or referenced)
- Which are DELETED

## Task Dependency Graph

A mermaid flowchart showing phase dependencies.
Explicitly note which phases can run in parallel.

## Task Status

A table tracking each phase:

| Phase | Task File | Status | Description |
|---|---|---|---|
| 0 | [phase-0-xxx.md](./phase-0-xxx.md) | 🔲 TODO | Short description |
| 1 | [phase-1-xxx.md](./phase-1-xxx.md) | 🔲 TODO | Short description |

> **How to work on this epic:** Read this file first to understand the full architecture.
> Then check the status table above. Pick the first `🔲 TODO` task whose dependencies
> (see dependency graph) are `✅ DONE`. Open that task file and follow its instructions.
> When done, update the status in this table to `✅ DONE`.

## Key Conventions

Bullet list of project conventions relevant to this epic:
monorepo tool, build tool, formatter, TypeScript config, key library versions, patterns to follow.

## Existing Code Reference

A table of files the agent MUST read before working on tasks:

| File | Relevance |
|---|---|
| `path/to/file.ts` | What pattern or type to reuse from this file |

## Domain-Specific Reference (optional)

Tables or sections that capture domain knowledge needed across multiple phases
(e.g., event type mappings, API schemas, protocol details).
```

### Mermaid Diagram Style

Always use dark fills with light text:

```
style NodeId fill:#1a1a2e,stroke:#00d9ff,color:#ffffff
```

## Step 3: Write Phase Task Files

Each `phase-N-{name}.md` follows this exact structure:

```markdown
# Phase N: {Title}

> **GitHub Issue:** #{number} · **Epic:** [AGENTS.md](./AGENTS.md)
> **Dependencies:** Phase X (what must be complete)
> **Parallel with:** Phase Y (if applicable)
> **Blocks:** Phase Z

## Objective

One paragraph: what this phase accomplishes. Be specific.

## What You're Building

A mermaid diagram scoped to THIS phase's deliverables.

## Deliverables

Numbered list of concrete outputs. For each deliverable:

### 1. `path/to/file.ts`

Explain what to build, then show the code or type signature:

- For NEW files: show the full implementation or a detailed skeleton with all type signatures.
- For MODIFIED files: show the specific changes (what to add/replace).
- Include tables for mapping logic, decision matrices, or config values.

### 2. Next deliverable...

## Verification

How to confirm the phase is complete:

1. **Automated checks** — exact shell commands to run (build, typecheck, test).
2. **Manual test scenarios** — numbered steps with expected outcomes.
   Write test scenarios as: input → action → expected output.

## Files to Create/Modify

| File | Action |
|---|---|
| `path/to/new-file.ts` | **Create** |
| `path/to/existing-file.ts` | **Modify** (what changes) |

## Done Criteria

- [ ] Checklist item matching each deliverable
- [ ] Build/typecheck commands pass
- [ ] Update the status in [AGENTS.md](./AGENTS.md) to `✅ DONE`
```

## Writing Principles

1. **Be executable** — An agent (or developer) should be able to complete a phase by ONLY reading the epic AGENTS.md + that phase's file. No guessing.
2. **Show, don't describe** — Include actual code, type signatures, and shell commands. Avoid vague instructions like "implement the handler."
3. **Declare dependencies explicitly** — Every phase states what it depends on and what it blocks. The dependency graph in AGENTS.md must match.
4. **Keep phases small and testable** — Each phase should be independently verifiable. Prefer more small phases over fewer large ones.
5. **Reference existing code** — Point to specific files and line ranges for patterns to follow. Never assume the agent knows the codebase conventions.
6. **Include verification commands** — Every phase ends with exact commands to confirm success. The agent should never wonder "am I done?"
7. **Track status** — Use `🔲 TODO` / `🔧 IN PROGRESS` / `✅ DONE` in the status table. The working instruction tells agents to update status when done.

## Naming Conventions

- **Epic directory:** `tasks/{descriptive-slug}/` (e.g., `plan-a-ai-sdk-provider`, `migrate-auth-to-clerk`)
- **Phase files:** `phase-{N}-{short-name}.md` (e.g., `phase-0-package-setup.md`, `phase-3-session-management.md`)
- Phase numbers start at 0
- Use kebab-case for all slugs
