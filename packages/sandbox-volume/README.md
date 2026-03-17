# @giselles-ai/sandbox-volume

Persistent workspace synchronization for `@vercel/sandbox`.

`sandbox-volume` is not a filesystem mount and not a VM snapshot layer.
It is a **transactional workspace sync**:

1. load persisted workspace files into a sandbox path (default `/workspace`)
2. run your code
3. diff current files against the last saved manifest
4. optionally save manifest + files back through a pluggable adapter

## Install

```bash
npm i @giselles-ai/sandbox-volume @vercel/sandbox
```

## Quick start

```ts
import { Sandbox } from "@vercel/sandbox";
import {
  SandboxVolume,
  InMemoryStorageAdapter,
} from "@giselles-ai/sandbox-volume";

const sandbox = await Sandbox.create({ runtime: "node24" });
const adapter = new InMemoryStorageAdapter();
const volume = await SandboxVolume.create({
  key: "repos/my-app",
  adapter,
  include: ["src/**", "package.json"],
  exclude: [".sandbox/**/*", "dist/**"],
});

await volume.mount(sandbox, async () => {
  await sandbox.runCommand("bash", ["-lc", "printf 'hello\\n' > /workspace/notes.md"]);
});
```

`mount()` runs your callback, then commits file changes automatically when the callback
resolves. If the callback throws, it still closes and releases locks but does not commit.

## Core API

- `SandboxVolume.create(options)`
  - `adapter`: `StorageAdapter` (required)
  - `key`: stable workspace identifier (string)
  - `path` (optional): mount path, default `"/workspace"`
  - `defaultLockMode` (optional): `"none" | "exclusive" | "shared"`
  - `include` (optional): glob include list, defaults to all files
  - `exclude` (optional): glob exclude list, applied after `include`
- `volume.begin(sandbox, options?)`
  - options: `{ path?, lock? }`
  - opens a `WorkspaceTransaction`
- `volume.mount(sandbox, callback, options?)`
  - callback: `(sandbox, tx) => Promise<TResult>`
  - commits automatically on success
  - always closes transaction in `finally`
- `volume.commitAll(sandbox)`
  - opens, commits once, closes

Transaction (`WorkspaceTransaction`) methods:

- `open()`
- `diff()`: returns `{ key, kind, changes }`
- `commit()`: persists when changes exist (`committed: true`) and returns commit metadata
- `close()`: idempotent cleanup and optional lock release

## Path filters (`include` / `exclude`)

`SandboxVolume` supports an allow/deny filter for file synchronization:

- `include` is an allow list. If empty or omitted, all paths are eligible.
- `exclude` is a deny list and always wins when a path matches both.
- filtering applies during hydration, scan, diff, and commit.
- only filtered-in paths are included in the persisted manifest.

Example filter set:

```ts
{
  include: ["src/**", "package.json"],
  exclude: ["src/generated/**", "dist/**"],
}
```

When using those filters, `notes.md` and `dist/out.js` are not persisted nor tracked.

Known caveat:

- If a workspace was previously saved with broader rules and later narrowed, historical
  out-of-scope entries are not removed immediately. They remain in storage until a
  commit with in-scope changes rewrites the manifest.

## Memory adapter

`@giselles-ai/sandbox-volume` currently ships with a concrete in-memory adapter for
tests/examples.

```ts
import {
  InMemoryStorageAdapter,
  createMemoryStorageAdapter,
} from "@giselles-ai/sandbox-volume";

const adapter = new InMemoryStorageAdapter();
// or
const adapter = createMemoryStorageAdapter();
```

## Diff model

The package tracks a manifest containing file path + hash + size and compares manifests on
every transaction:

- `create` / `update` / `delete` change kinds
- `delete` is explicit, not inferred from timestamps
- no-op commits are returned as `{ committed: false }` without calling `saveWorkspace`

## Locking

If `defaultLockMode` or `mount(..., { lock })` is not `"none"`, the adapter must
implement `acquireLock` and `releaseLock`.

## Planned features

The following are not implemented yet:

- concrete Blob/S3/Supabase adapters in this package
- snapshot/branch/share helpers (`fork`, `snapshot`, `share`)

## License

Apache-2.0
