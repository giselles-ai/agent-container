# sandbox-volume

Persistent workspace sync for `@vercel/sandbox`. This package is not a filesystem mount and should stay storage-agnostic.

## Scope

- Own the lifecycle of `hydrate -> execute -> diff -> commit`
- Persist workspace files and manifest metadata through a pluggable adapter
- Expose a small public API centered on `SandboxVolume`, `begin()`, and `mount()`
- Keep application session state, chat orchestration, DB schema, and UI concerns outside this package

## Non-Goals

- Emulating block storage or POSIX mount guarantees
- Persisting full VM state
- Owning Vercel Snapshot lifecycle beyond optional future integration points
- Hiding storage semantics behind implicit magic

## Ground Truth

`README.md` is the product target, but implementation details must be validated against the real Sandbox SDK and installed type definitions.

Use these SDK primitives as the baseline:

- `Sandbox.create({ runtime, timeout, source })`
- `sandbox.runCommand(command, args)` or `sandbox.runCommand({ cmd, args, cwd, env })`
- `sandbox.mkDir(path)`
- `sandbox.writeFiles([{ path, content }])`
- `sandbox.readFileToBuffer({ path })`
- `sandbox.downloadFile(...)`
- `sandbox.stop()`
- `sandbox.snapshot()`

If the README and SDK disagree, fix the code and docs around the SDK reality rather than inventing unsupported behavior.

## Package Shape

Expected long-term structure:

- `src/sandbox-volume.ts`: public facade and option normalization
- `src/transaction.ts`: begin/diff/commit/close lifecycle
- `src/manifest.ts`: persisted manifest versioning and comparison
- `src/sandbox-files.ts`: sandbox path normalization, file writes, file scans
- `src/adapters/types.ts`: storage adapter contract
- `src/adapters/*`: optional bundled adapters kept thin over the core contract

## Invariants

- Always normalize paths to sandbox-relative POSIX paths inside manifests
- Track deletes explicitly; absence alone is not enough once persistence exists
- Treat no-op commits as first-class outcomes
- Keep lock handling explicit and adapter-driven
- Do not require snapshots for correctness
- Do not require a database for correctness
- Do not assume the storage backend supports rename, partial update, or filesystem semantics

## Design Rules

- Prefer manifest-based diffing over timestamp-only heuristics; `find -newer` alone is not enough for deletes
- Keep core types backend-neutral so Blob, S3, and Supabase-style adapters can share the same contract
- Use a memory adapter for tests before adding real backends
- Make failure modes visible: callback failure, lock acquisition failure, commit conflict, adapter write failure
- Keep public API small; planned features such as `fork()` or `share()` should remain clearly marked as future work until implemented

## Existing References

- `README.md`: public package story and aspirational API
- `/Users/satoshi/repo/giselles-ai/agent-container/packages/agent-kit/src/build-snapshot.ts`: sandbox file upload patterns
- `/Users/satoshi/repo/giselles-ai/agent-container/packages/agent-kit/src/sandbox-utils.ts`: command wrapper and error handling
- `/Users/satoshi/repo/giselles-ai/agent-container/packages/agent/src/build.ts`: `writeFiles()` and `snapshot()` usage
- `/Users/satoshi/repo/giselles-ai/agent-container/packages/agent/src/agent-api.ts`: `readFileToBuffer()` usage

## Implementation Order

1. Scaffold the package and lock the public contract against the actual SDK.
2. Define adapter and manifest types.
3. Implement hydration into the sandbox.
4. Implement diff and commit with delete tracking.
5. Add `mount()` and locking.
6. Align README and add end-to-end verification.

## Testing Expectations

- Unit test manifest diffing separately from sandbox integration
- Test transaction hydration and commit flows with a memory adapter and mocked sandbox surface
- Add at least one integration-style test proving persistence across multiple runs
- Run `pnpm --filter @giselles-ai/sandbox-volume test`, `typecheck`, and `build` before calling work done
