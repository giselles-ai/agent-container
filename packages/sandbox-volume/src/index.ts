export {
	createMemoryStorageAdapter,
	InMemoryStorageAdapter,
} from "./adapters/memory";
export type {
	WorkspaceDiff as ManifestDiff,
	WorkspaceManifestEntry,
	WorkspaceManifestVersion,
} from "./manifest";
export {
	buildManifest,
	createEmptyManifest,
	dedupeWorkspaceChanges,
	diffManifests,
	hasChanges,
	hashContent,
} from "./manifest";
export { SandboxVolume } from "./sandbox-volume";
export { WorkspaceTransaction } from "./transaction";
export type {
	LockMode,
	MountOptions,
	SandboxVolumeOptions,
	StorageAdapter,
	StorageLoadResult,
	StorageLock,
	StoragePathRules,
	StorageSaveResult,
	VolumeMountCallback,
	WorkspaceChangeKind,
	WorkspaceCommitResult,
	WorkspaceDiff,
	WorkspaceDiffKind,
	WorkspaceFileChange,
	WorkspaceFileChangeKind,
	WorkspaceFileEntry,
	WorkspaceManifest,
	WorkspacePayload,
	WorkspaceTransactionOptions,
	WorkspaceTransactionResult,
} from "./types";
