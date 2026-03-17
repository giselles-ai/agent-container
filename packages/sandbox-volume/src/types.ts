import type { Sandbox } from "@vercel/sandbox";
import type {
	LockMode,
	StorageAdapter,
	StorageLoadResult,
	StorageLock,
	StorageSaveResult,
	WorkspaceFileEntry,
	WorkspacePayload,
} from "./adapters/types";
import type {
	WorkspaceDiff,
	WorkspaceDiffKind,
	WorkspaceFileChange,
	WorkspaceFileChangeKind,
	WorkspaceManifest,
	WorkspaceManifestEntry,
} from "./manifest";

export type {
	LockMode,
	StorageAdapter,
	StorageLoadResult,
	StorageLock,
	StorageSaveResult,
	WorkspaceFileEntry,
	WorkspacePayload,
} from "./adapters/types";
export type {
	WorkspaceDiff,
	WorkspaceDiffKind,
	WorkspaceFileChange,
	WorkspaceFileChangeKind,
	WorkspaceManifest,
	WorkspaceManifestEntry,
} from "./manifest";

export interface StoragePathRules {
	include?: string[];
	exclude?: string[];
}

export interface SandboxVolumeOptions extends StoragePathRules {
	adapter: StorageAdapter;
	key: string;
	path?: string;
	defaultLockMode?: LockMode;
}

export interface WorkspaceTransactionOptions {
	lock?: LockMode;
}

export interface WorkspaceCommitResult {
	key: string;
	committed: boolean;
	nextVersion: number;
	committedAt: Date;
	diff: WorkspaceDiff;
}

export type WorkspaceChangeKind = WorkspaceFileChangeKind;
export interface WorkspaceChange extends WorkspaceFileChange {
	kind: WorkspaceChangeKind;
}

export interface WorkspaceTransaction {
	readonly key: string;
	readonly sandbox: Sandbox;
	readonly options: WorkspaceTransactionOptions;
	readonly mountPath: string;
	readonly baselineManifest: WorkspaceManifest;
	readonly baselineFiles: WorkspaceFileEntry[];
	open(): Promise<void>;
	diff(): Promise<WorkspaceDiff>;
	commit(): Promise<WorkspaceCommitResult>;
	close(): Promise<void>;
}

export interface MountOptions extends WorkspaceTransactionOptions {
	path?: string;
}

export type WorkspaceTransactionResult = {
	tx: WorkspaceTransaction;
	diff: WorkspaceDiff;
};

export type VolumeMountCallback<TResult = WorkspaceDiff> = (
	sandbox: Sandbox,
	transaction: WorkspaceTransaction,
) => Promise<TResult>;
