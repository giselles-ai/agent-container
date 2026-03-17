import type { Sandbox } from "@vercel/sandbox";
import { WorkspaceTransaction as DefaultWorkspaceTransaction } from "./transaction";
import type {
	MountOptions,
	SandboxVolumeOptions,
	StorageAdapter,
	VolumeMountCallback,
	WorkspaceCommitResult,
	WorkspaceDiff,
	WorkspaceTransaction,
} from "./types";

export class SandboxVolume {
	readonly #options: SandboxVolumeOptions;

	private constructor(options: SandboxVolumeOptions) {
		this.#options = options;
	}

	static async create(options: SandboxVolumeOptions): Promise<SandboxVolume> {
		if (!options.adapter) {
			throw new Error("SandboxVolumeOptions.adapter is required.");
		}

		if (!options.key) {
			throw new Error("SandboxVolumeOptions.key is required.");
		}

		return new SandboxVolume(options);
	}

	get key(): string {
		return this.#options.key;
	}

	get adapter(): StorageAdapter {
		return this.#options.adapter;
	}

	get path(): string {
		return this.#options.path ?? "/workspace";
	}

	async begin(
		sandbox: Sandbox,
		options: MountOptions = {},
	): Promise<WorkspaceTransaction> {
		const mountPath = options.path ?? this.path;
		const tx = new DefaultWorkspaceTransaction({
			key: this.key,
			sandbox,
			adapter: this.adapter,
			mountPath,
			lock: options.lock ?? this.#options.defaultLockMode,
		});
		await tx.open();
		return tx;
	}

	async mount<TResult = WorkspaceDiff>(
		sandbox: Sandbox,
		callback: VolumeMountCallback<TResult>,
		options: MountOptions = {},
	): Promise<TResult> {
		const tx = await this.begin(sandbox, options);
		let callbackError: unknown = null;

		try {
			const result = await callback(sandbox, tx);
			await tx.commit();
			return result;
		} catch (error) {
			callbackError = error;
			throw error;
		} finally {
			try {
				await tx.close();
			} catch (closeError) {
				if (callbackError === null) {
					throw closeError;
				}
			}
		}
	}

	async commitAll(sandbox: Sandbox): Promise<WorkspaceCommitResult> {
		const tx = await this.begin(sandbox);
		let commitError: unknown = null;

		try {
			return await tx.commit();
		} catch (error) {
			commitError = error;
			throw error;
		} finally {
			try {
				await tx.close();
			} catch (closeError) {
				if (commitError === null) {
					throw closeError;
				}
			}
		}
	}
}
