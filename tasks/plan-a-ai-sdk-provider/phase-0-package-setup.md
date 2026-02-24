# Phase 0: Package Setup

> **GitHub Issue:** #5332 · **Epic:** [AGENTS.md](./AGENTS.md)
> **Dependencies:** None (can start immediately)
> **Parallel with:** Phase 2

## Objective

Create the `packages/giselle-provider` package with build configuration, DI interface types, and a minimal export surface. This package will house the custom AI SDK `LanguageModelV3` provider.

## What You're Building

A new workspace package that follows the same conventions as `packages/browser-tool` and `packages/sandbox-agent`. It compiles with `tsup`, uses `biome` for formatting, and exports the DI interface + type definitions needed by subsequent phases.

## Deliverables

### 1. Directory Structure

```
packages/giselle-provider/
├── src/
│   ├── index.ts              ← re-export public API
│   └── types.ts              ← DI interface + session types
├── package.json
├── tsconfig.json
└── tsup.ts
```

### 2. `package.json`

```jsonc
{
  "name": "@giselles-ai/giselle-provider",
  "version": "0.1.0",
  "type": "module",
  "sideEffects": false,
  "license": "Apache-2.0",
  "repository": {
    "type": "git",
    "url": "https://github.com/giselles-ai/agent-container.git",
    "directory": "packages/giselle-provider"
  },
  "files": ["dist"],
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "pnpm clean && tsup --config tsup.ts",
    "clean": "rm -rf dist *.tsbuildinfo",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "format": "pnpm exec biome check --write ."
  },
  "dependencies": {
    "@ai-sdk/provider": "^2.0.0",
    "@ai-sdk/provider-utils": "^3.0.0",
    "ioredis": "5.9.3",
    "zod": "4.3.6"
  },
  "devDependencies": {
    "@types/node": "25.3.0",
    "tsup": "8.5.1",
    "typescript": "5.9.3"
  }
}
```

> **Note:** Check the latest `@ai-sdk/provider` and `@ai-sdk/provider-utils` versions before installing. The versions above are placeholders — use whatever is current. Run `npm view @ai-sdk/provider version` and `npm view @ai-sdk/provider-utils version` to check.

### 3. `tsconfig.json`

Follow the same pattern as `packages/browser-tool/tsconfig.json`:

```jsonc
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

### 4. `tsup.ts`

Follow the same pattern as `packages/browser-tool/tsup.ts` or `packages/sandbox-agent/tsup.ts`. Export a single entry point `src/index.ts` with `dts: true`.

Look at the existing `tsup.ts` files in sibling packages to match the exact pattern.

### 5. `src/types.ts` — DI Interface & Session Types

This is the most important deliverable. Define the Dependency Injection interface that allows all external I/O to be mocked in tests.

```typescript
import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";

/**
 * Parameters for connecting to the Giselle Cloud API.
 */
export type ConnectCloudApiParams = {
  endpoint: string;
  message: string;
  document?: string;
  sessionId?: string;
  sandboxId?: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

/**
 * Result of connecting to the Cloud API — a readable stream reader.
 */
export type ConnectCloudApiResult = {
  reader: ReadableStreamDefaultReader<Uint8Array>;
  response: Response;
};

/**
 * A live relay subscription that receives relay requests via Redis pub/sub.
 */
export type RelaySubscription = {
  /** Wait for the next relay request. Resolves with the parsed request object. */
  nextRequest: () => Promise<Record<string, unknown>>;
  /** Unsubscribe and clean up. */
  close: () => Promise<void>;
};

/**
 * Dependency Injection interface for the Giselle provider.
 *
 * Every external I/O operation is abstracted behind this interface,
 * allowing tests to inject mocks without network or Redis dependencies.
 */
export type GiselleProviderDeps = {
  /** Open a streaming connection to the Giselle Cloud API. */
  connectCloudApi: (params: ConnectCloudApiParams) => Promise<ConnectCloudApiResult>;

  /** Create a Redis pub/sub subscription for relay requests. */
  createRelaySubscription: (params: {
    sessionId: string;
    token: string;
    relayUrl: string;
  }) => RelaySubscription;

  /** Send a relay response back to the browser extension. */
  sendRelayResponse: (params: {
    relayUrl: string;
    sessionId: string;
    token: string;
    response: Record<string, unknown>;
  }) => Promise<void>;
};

/**
 * Session metadata persisted in Redis.
 * Survives Vercel instance recycling.
 */
export type SessionMetadata = {
  providerSessionId: string;
  geminiSessionId?: string;
  sandboxId?: string;
  relaySessionId?: string;
  relayToken?: string;
  relayUrl?: string;
  pendingRequestId?: string;
  createdAt: number;
};

/**
 * Live connection state stored in the globalThis Map.
 * Process-local only — lost on instance recycle.
 */
export type LiveConnection = {
  reader: ReadableStreamDefaultReader<Uint8Array>;
  buffer: string;
  relaySubscription: RelaySubscription | null;
  textBlockOpen: boolean;
};

/**
 * Options for creating the Giselle provider.
 */
export type GiselleProviderOptions = {
  /** Base URL for the Giselle Cloud API (e.g. "https://studio.giselles.ai"). */
  cloudApiUrl: string;
  /** Custom headers to send with Cloud API requests. */
  headers?: Record<string, string>;
  /** Override default DI dependencies (primarily for testing). */
  deps?: Partial<GiselleProviderDeps>;
};
```

### 6. `src/index.ts`

Minimal re-exports for now. More exports will be added in later phases.

```typescript
export type {
  GiselleProviderDeps,
  GiselleProviderOptions,
  SessionMetadata,
  LiveConnection,
  ConnectCloudApiParams,
  ConnectCloudApiResult,
  RelaySubscription,
} from "./types";
```

## Verification

Run these commands from the repo root to verify the phase is complete:

```bash
# 1. Install dependencies
pnpm install

# 2. Build the new package
pnpm --filter @giselles-ai/giselle-provider build

# 3. Type-check
pnpm --filter @giselles-ai/giselle-provider typecheck

# 4. Verify dist output exists
ls packages/giselle-provider/dist/index.js
ls packages/giselle-provider/dist/index.d.ts

# 5. Ensure existing packages still build
pnpm build
```

All commands should succeed with zero errors.

## Notes

- The `@ai-sdk/provider` package exports `LanguageModelV3`, `LanguageModelV3StreamPart`, and related types. Verify the exact import paths after installing.
- Do NOT add `react` or `react-dom` as dependencies — this package is server-only.
- The `ioredis` dependency will be used in Phase 3 (session-manager.ts) but is declared now to avoid a package.json edit later.
- The `pnpm-workspace.yaml` at the repo root already includes `packages/*`, so the new package is automatically part of the workspace.

## Done Criteria

- [ ] `packages/giselle-provider/` exists with all files listed above
- [ ] `pnpm install` succeeds
- [ ] `pnpm --filter @giselles-ai/giselle-provider build` produces `dist/`
- [ ] `pnpm --filter @giselles-ai/giselle-provider typecheck` passes
- [ ] All types in `types.ts` compile without errors
- [ ] Update the status in [AGENTS.md](./AGENTS.md) to `✅ DONE`
