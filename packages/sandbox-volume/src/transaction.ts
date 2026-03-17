import type { Sandbox } from "@vercel/sandbox";

import {
	buildManifest,
	createEmptyManifest,
	diffManifests,
	hasChanges,
	type WorkspaceDiff,
} from "./manifest";
import {
	collectWorkspaceFiles,
	hydrateWorkspaceFiles,
	normalizeMountPath,
	scanWorkspaceFilePaths,
} from "./sandbox-files";
import type {
	LockMode,
	StorageAdapter,
	StorageLock,
	WorkspaceCommitResult,
	WorkspaceFileEntry,
	WorkspaceTransaction as WorkspaceTransactionHandle,
	WorkspaceTransactionOptions,
} from "./types";

interface WorkspaceTransactionInit {
	key: string;
	sandbox: Sandbox;
	adapter: StorageAdapter;
	mountPath: string;
	lock?: LockMode;
}

export class WorkspaceTransaction implements WorkspaceTransactionHandle {
	readonly #key: string;
	readonly #sandbox: Sandbox;
	readonly #adapter: StorageAdapter;
	readonly #mountPath: string;
	readonly #options: WorkspaceTransactionOptions;
	#opened = false;
	#closed = false;
	#lock: StorageLock | null = null;
	#baselineManifest = createEmptyManifest();
	#baselineFiles: WorkspaceFileEntry[] = [];

	constructor(input: WorkspaceTransactionInit) {
		this.#key = input.key;
		this.#sandbox = input.sandbox;
		this.#adapter = input.adapter;
		this.#mountPath = normalizeMountPath(input.mountPath);
		this.#options = { lock: input.lock };
	}

	get key(): string {
		return this.#key;
	}

	get sandbox(): Sandbox {
		return this.#sandbox;
	}

	get options(): WorkspaceTransactionOptions {
		return this.#options;
	}

	get mountPath(): string {
		return this.#mountPath;
	}

	get baselineManifest() {
		return this.#baselineManifest;
	}

	get baselineFiles() {
		return this.#baselineFiles;
	}

	async open(): Promise<void> {
		if (this.#closed) {
			throw new Error("Cannot open a closed transaction.");
		}

		if (this.#opened) {
			return;
		}

		const lockMode = this.#options.lock ?? "none";
		if (lockMode !== "none") {
			if (!this.#adapter.acquireLock || !this.#adapter.releaseLock) {
				throw new Error(
					"StorageAdapter requires acquireLock and releaseLock for locking.",
				);
			}

			this.#lock = await this.#adapter.acquireLock(this.#key, lockMode);
		}

		try {
			const loaded = await this.#adapter.loadWorkspace(this.#key);
			if (loaded) {
				this.#baselineManifest = loaded.manifest;
				this.#baselineFiles = [...loaded.files];
			}
			await hydrateWorkspaceFiles(
				this.#sandbox,
				this.#mountPath,
				loaded?.files ?? [],
			);
			this.#opened = true;
		} catch (error) {
			await this.#releaseLock();
			throw error;
		}
	}

	async diff(): Promise<WorkspaceDiff> {
		await this.open();

		const files = await this.#scan();
		const now = new Date();
		const manifest = buildManifest(
			files.map((file) => ({
				path: file.path,
				content: file.content,
			})),
			now,
		);
		return diffManifests(this.#key, this.#baselineManifest, manifest);
	}

	async commit(): Promise<WorkspaceCommitResult> {
		await this.open();
		const scannedFiles = await this.#scan();
		const manifest = buildManifest(
			scannedFiles.map((file) => ({
				path: file.path,
				content: file.content,
			})),
		);
		const diff = diffManifests(this.#key, this.#baselineManifest, manifest);

		if (!hasChanges(diff)) {
			return {
				key: this.#key,
				committed: false,
				nextVersion: this.#baselineManifest.version,
				committedAt: new Date(),
				diff,
			};
		}

		const saved = await this.#adapter.saveWorkspace(this.#key, {
			manifest: {
				...manifest,
				version: this.#baselineManifest.version + 1,
			},
			files: scannedFiles,
		});

		this.#baselineManifest = {
			...manifest,
			version: saved.version,
			updatedAt: saved.updatedAt,
		};
		this.#baselineFiles = scannedFiles;

		return {
			key: this.#key,
			committed: true,
			nextVersion: saved.version,
			committedAt: saved.updatedAt,
			diff,
		};
	}

	async #scan(): Promise<WorkspaceFileEntry[]> {
		const paths = await scanWorkspaceFilePaths(this.#sandbox, this.#mountPath);
		return collectWorkspaceFiles(this.#sandbox, this.#mountPath, paths);
	}

	async close(): Promise<void> {
		if (this.#closed) {
			return;
		}

		this.#closed = true;
		await this.#releaseLock();
	}

	async #releaseLock(): Promise<void> {
		if (!this.#lock) {
			return;
		}

		const lock = this.#lock;
		this.#lock = null;
		await this.#adapter.releaseLock?.(lock);
	}
}
