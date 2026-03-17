# sandbox-volume

> Ephemeral compute. Persistent workspace.

Run code in a [Vercel Sandbox](https://vercel.com/sandbox). Keep the files that matter.

---

## The problem

Vercel Sandbox gives you isolated, ephemeral compute. That's the point.  
But ephemeral means everything disappears when the sandbox stops.

For one-shot scripts, that's fine.  
For coding agents running across multiple sessions, that's a problem.

**sandbox-volume** adds a persistent workspace layer on top of Vercel Sandbox.

It is designed as a small, composable OSS boundary:

- `sandbox-volume`: workspace sync, diff, commit, lock, and transaction primitives
- storage adapters: Blob, S3, Supabase Storage, or your own backend

It does **not** try to own your app's session model, agent orchestration, database schema, or UI.

---

## Install

```bash
npm i sandbox-volume
```

Requires `@vercel/sandbox`.

If you use a bundled adapter, install one storage peer as well:

- `@vercel/blob` for Blob
- AWS SDK packages for S3
- `@supabase/storage-js` or Supabase client packages for Supabase Storage

---

## Usage

```ts
import { Sandbox } from "@vercel/sandbox"
import { SandboxVolume } from "@giselles-ai/sandbox-volume"
import { vercelBlobAdapter } from "@giselles-ai/sandbox-volume/vercel-blob"

const sandbox = await Sandbox.create({ runtime: "node24" })

const volume = await SandboxVolume.create({
  key: "repos/my-app",
  adatper: vercelBlobAdapter()
})

await volume.mount(sandbox, async (sandbox) => {
  await sandbox.runCommand("npm", ["test"])
  await sandbox.runCommand("node", ["fix.js"])
})

await sandbox.stop()
```

On `mount()`:

1. Pull workspace archive from your storage backend
2. Extract into sandbox at `/workspace`
3. Run your code
4. Detect changed files via `find -newer`
5. Push changes back to the storage backend

No VM state. No long-lived containers. Just the files that changed.

---

## Not a real mount

This is not a block device. This is not EBS.

It is a **transactional workspace sync**.

```
Storage Backend  ⇄  Vercel Sandbox (ephemeral)
```

- No kernel-level mount
- No POSIX guarantees
- No shared filesystem

Instead:

- Fast startup
- Strong isolation
- Simple mental model
- Bring your own storage

---

## API

### `SandboxVolume.create(options)`

```ts
const volume = await SandboxVolume.create({
  key: "repos/my-app",        // Vercel Blob key
  path: "/workspace",         // mount path in sandbox (default)
  include: ["src/**", "tests/**", "package.json"],
  exclude: ["node_modules/**", "dist/**", ".git/**"],
})
```

### `SandboxVolume.create(options)`

```ts
import { vercelBlobAdapter } from "@giselles-ai/sandbox-volume/vercel-blob"

const volume = await SandboxVolume.create(
  {
    adapter: vercelBlobAdapter(),
    key: "repos/my-app",
    include: ["src/**", "package.json"],
    exclude: ["node_modules/**", ".git/**", "dist/**"],
  },
  createBlobAdapter()
)
```

### `volume.mount(sandbox, callback)`

```ts
await volume.mount(sandbox, async (sandbox) => {
  await sandbox.runCommand("npm", ["install"])
  await sandbox.runCommand("npm", ["test"])
})
```

Changes made inside the callback are automatically persisted on exit.

### `volume.mount(sandbox, callback, options)`

```ts
const diff = await volume.mount(
  sandbox,
  async (sandbox, ws) => {
    await sandbox.runCommand("npm", ["test"])

    const diff = await ws.diff()
    await ws.commit()

    return diff
  },
  { lock: "exclusive" }
)
```

### Manual transaction mode

```ts
const tx = await volume.begin(sandbox, { lock: "exclusive" })

try {
  await sandbox.runCommand("npm", ["test"])
  const diff = await tx.diff()
  await tx.commit()
} finally {
  await tx.close()
}
```

---

## Selective sync

Skip what doesn't need to travel.

```ts
const volume = await SandboxVolume.create({
  key: "repos/acme-web",
  include: [
    "src/**",
    "tests/**",
    "package.json",
    "pnpm-lock.yaml",
  ],
  exclude: [
    "node_modules/**",
    ".git/**",
    "dist/**",
    "*.log",
  ],
})
```

---

## How it works

```
[1] Load       storage adapter → archive/manifest → sandbox /workspace
[2] Execute    your code runs in the sandbox
[3] Diff       find /workspace -newer /tmp/volume_start
[4] Commit     changed files → archive/manifest → storage adapter
```

Only changed files are written back.

---

## vs. Snapshots

Vercel Sandbox has a native [Snapshots](https://vercel.com/docs/vercel-sandbox/concepts#snapshots) feature.  
sandbox-volume is not a replacement.

|                | Snapshot           | sandbox-volume            |
| -------------- | ------------------ | ------------------------- |
| Captures       | Full VM state      | Workspace files only      |
| Storage        | Vercel managed     | Your storage backend      |
| Key            | Snapshot ID        | Arbitrary workspace key   |
| Best for       | Reproducible envs  | Ongoing agent work        |

Use snapshots for environment setup.  
Use volumes for work in progress.

---

## Consistency model

- Default: single-writer per key
- Explicit commit required in manual mode
- Deletes are tracked
- No implicit merge

Planned:

- `volume.fork()` — branch a workspace
- `volume.snapshot()` — hybrid with Vercel Snapshots
- `volume.share()` — URL-based handoff between agents

---

## Package boundary

### `@giselles-ai/sandbox-volume`

Owns:

- Hydrate a workspace into a sandbox
- Detect file changes
- Commit or rollback
- Track deletes
- Apply include/exclude rules
- Provide lock and transaction primitives
- Stay storage-backend agnostic

Does not own:

- User, tenant, or organization identity
- Session or runtime database schemas
- Queue workers, webhooks, or approval workflows
- Agent orchestration or multi-agent merge policy
- UI components

### Storage adapters

Official adapters can live in separate packages:

- `@giselles-ai/sandbox-volume/sandbox-volume/blob`
- `@giselles-ai/sandbox-volume/sandbox-volume/s3`
- `@giselles-ai/sandbox-volume/sandbox-volume/supabase`

Each adapter only needs to implement a small backend contract:

- `load(key)`
- `save(key, payload, version)`
- `lock(key)`
- `unlock(key, lease)`
- `stat(key)`

Apps can provide their own adapter for any storage system.

---

## What this library is for

Good fit:

- AI coding agents running across sessions
- Persistent working directories on top of ephemeral sandboxes
- CI-like sandbox jobs that need resumable file state
- Sandbox-native developer tools

Not the right boundary:

- Full app session lifecycle
- Domain-specific runtime persistence
- Tenant-aware access control models
- Product-specific artifact registries
- Workflow engines

---

## Authentication

sandbox-volume itself is storage-agnostic.

Each adapter reads credentials from its own environment or accepts them explicitly.

For example, the Vercel Blob adapter can read:

```bash
BLOB_READ_WRITE_TOKEN=...
```

No additional setup if you're already on Vercel.

---

## Design principles

- Ephemeral compute by default
- Persist intent (files), not process (VM)
- Make unsafe execution safe to repeat
- Keep the OSS boundary sharp
- Bring your own state model

---

## Non-goals

- Full POSIX filesystem semantics
- Real-time multi-writer sync
- Replacing Git
- Owning session/runtime database schemas
- Owning workflow orchestration

---

## Status

Experimental. API may change.

Built for:

- AI coding agents running across sessions
- Sandboxed execution with resumable state
- Developer workflows on Vercel infrastructure
- Apps that want a small persistence primitive, not a full platform

---

## License

MIT
