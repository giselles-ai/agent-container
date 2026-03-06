# agent-snapshot-kit

CLI & library for building Vercel Sandbox snapshots with an agent execution environment (Gemini CLI / Codex CLI + browser-tool MCP server).

## Package Structure

| File | Role |
|---|---|
| `src/cli.ts` | CLI entry point (`agent-snapshot-kit build-snapshot`) |
| `src/build-snapshot.ts` | Core snapshot build logic |
| `src/sandbox-utils.ts` | Sandbox command execution helper |
| `src/index.ts` | Library exports (`buildSnapshot`, `BuildSnapshotOptions`) |

## Running in Local Mode

Local mode copies source code from the local monorepo into the Sandbox and builds from source, instead of installing from the npm registry. Use this when you want the snapshot to reflect in-progress changes to browser-tool.

### Prerequisites

- Node.js >= 20
- `VERCEL_TOKEN` environment variable (Vercel API token) — required by `@vercel/sandbox`
- `pnpm-lock.yaml` must exist at the monorepo root

### Steps

#### 1. Install dependencies

```bash
pnpm install
```

#### 2. Run the CLI in dev mode

`pnpm dev` is an alias for `tsx src/cli.ts`. Pass the `--local` flag and `--repo-root` to run in local mode.

```bash
# From the monorepo root
cd packages/agent-snapshot-kit
pnpm dev build-snapshot --local --repo-root ../..
```

`--repo-root` must point to the monorepo root directory. It is required when `--local` is specified.

#### 3. Reuse a base snapshot to speed things up

On the first run, a base snapshot is created with Gemini CLI and Codex CLI installed globally. The snapshot ID is printed to the console. On subsequent runs, pass `--base-snapshot-id` to skip the agent CLI installation step.

```bash
pnpm dev build-snapshot --local --repo-root ../.. \
  --base-snapshot-id <snapshotId>
```

You can also set it via the `BASE_SNAPSHOT_ID` environment variable:

```bash
BASE_SNAPSHOT_ID=<snapshotId> pnpm dev build-snapshot --local --repo-root ../..
```

#### 4. Other options

```
--sandbox-root <path>    Working directory inside the Sandbox (default: /vercel/sandbox)
--runtime <runtime>      Sandbox runtime (default: node24)
--timeout-ms <ms>        Sandbox timeout in ms (default: 2700000 = 45 min)
```

These can also be set via environment variables:

| CLI Option | Environment Variable |
|---|---|
| `--repo-root` | `BROWSER_TOOL_REPO_ROOT` |
| `--base-snapshot-id` | `BASE_SNAPSHOT_ID` |
| `--sandbox-root` | `BROWSER_TOOL_SANDBOX_ROOT` |
| `--runtime` | `BROWSER_TOOL_SNAPSHOT_RUNTIME` |
| `--timeout-ms` | `BROWSER_TOOL_SNAPSHOT_TIMEOUT_MS` |

### How Local Mode Works

1. If no base snapshot exists, create a new Sandbox, globally install Gemini CLI and Codex CLI, then save a base snapshot.
2. Create a new Sandbox from the base snapshot.
3. Collect files from the monorepo and upload them to the Sandbox (skipping `node_modules`, `dist`, `.next`, `.git`, `.jj`, and `*.tsbuildinfo`):
   - `package.json`
   - `pnpm-lock.yaml`
   - `pnpm-workspace.yaml`
   - `tsconfig.base.json`
   - `packages/browser-tool/`
4. Run `pnpm install --no-frozen-lockfile --filter @giselles-ai/browser-tool...` inside the Sandbox.
5. Run `pnpm --filter @giselles-ai/browser-tool run build` inside the Sandbox.
6. Write Gemini / Codex config files with the browser-tool MCP server path.
7. Create the final snapshot and output it as `SANDBOX_SNAPSHOT_ID`.

### npm Mode (Default)

When `--local` is not specified, `@giselles-ai/browser-tool` is installed from the npm registry. Use `--browser-tool-version` to pin a specific version.

```bash
pnpm dev build-snapshot
pnpm dev build-snapshot --browser-tool-version 0.2.0
```

## Build

```bash
pnpm build    # Build with tsup (outputs to dist/)
pnpm typecheck
```
