import { Sandbox } from "@vercel/sandbox";

type AgentType = "codex" | "gemini";

type WriteFilesOp = {
	kind: "writeFiles";
	files: Array<{ path: string; content: Buffer }>;
};

type RunCommandOp = {
	kind: "runCommand";
	cmd: string;
	args: string[];
};

type PendingOp = WriteFilesOp | RunCommandOp;

export class Agent {
	private _type: AgentType;
	private _snapshotId: string;
	private _pendingOps: PendingOp[] = [];

	private constructor(type: AgentType, snapshotId: string) {
		this._type = type;
		this._snapshotId = snapshotId;
	}

	static create(type: AgentType, options: { snapshotId: string }): Agent {
		const trimmed = options.snapshotId.trim();
		if (!trimmed) {
			throw new Error("snapshotId is required.");
		}

		return new Agent(type, trimmed);
	}

	get type(): AgentType {
		return this._type;
	}

	get snapshotId(): string {
		return this._snapshotId;
	}

	get dirty(): boolean {
		return this._pendingOps.length > 0;
	}

	addFiles(files: Array<{ path: string; content: Buffer }>): this {
		if (files.length === 0) {
			return this;
		}

		this._pendingOps.push({
			kind: "writeFiles",
			files,
		});

		return this;
	}

	runCommands(commands: Array<{ cmd: string; args?: string[] }>): this {
		for (const command of commands) {
			this._pendingOps.push({
				kind: "runCommand",
				cmd: command.cmd,
				args: command.args ?? [],
			});
		}

		return this;
	}

	async prepare(): Promise<void> {
		if (!this.dirty) {
			return;
		}

		const ops = this._pendingOps;
		this._pendingOps = [];

		const sandbox = await Sandbox.create({
			source: { type: "snapshot", snapshotId: this._snapshotId },
		});

		for (const op of ops) {
			switch (op.kind) {
				case "writeFiles":
					await sandbox.writeFiles(op.files);
					break;
				case "runCommand":
					await sandbox.runCommand(op.cmd, op.args);
					break;
			}
		}

		const snapshot = await sandbox.snapshot();
		this._snapshotId = snapshot.snapshotId;
	}
}
