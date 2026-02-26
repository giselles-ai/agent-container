import { Writable } from "node:stream";
import { Sandbox } from "@vercel/sandbox";

type SnapshotLog = {
	snapshotId: string;
	sourceSandboxId: string;
	status: string;
	sizeBytes: number;
	createdAt: string;
	expiresAt?: string;
};

function createCommandLogger(prefix: string) {
	return new Writable({
		write(chunk, _encoding, callback) {
			const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
			if (text.length > 0) {
				const stream = prefix === "stderr" ? process.stderr : process.stdout;
				stream.write(`[${prefix}] ${text}`);
			}
			callback();
		},
	});
}

async function main() {
	console.log("Creating sandbox...");
	const sandbox = await Sandbox.create();
	console.log(`Sandbox created: ${sandbox.sandboxId}`);

	console.log("Installing @google/gemini-cli...");
	const installCommand = await sandbox.runCommand({
		cmd: "npm",
		args: ["install", "-g", "@google/gemini-cli"],
		stdout: createCommandLogger("stdout"),
		stderr: createCommandLogger("stderr"),
	});
	console.log(
		`[install] exitCode=${installCommand.exitCode} cmdId=${installCommand.cmdId}`,
	);

	console.log("Creating snapshot...");
	const snapshot = await sandbox.snapshot();
	const snapshotInfo: SnapshotLog = {
		snapshotId: snapshot.snapshotId,
		sourceSandboxId: snapshot.sourceSandboxId,
		status: snapshot.status,
		sizeBytes: snapshot.sizeBytes,
		createdAt: snapshot.createdAt.toISOString(),
		expiresAt: snapshot.expiresAt?.toISOString(),
	};
	console.log(`[snapshot] ${JSON.stringify(snapshotInfo, null, 2)}`);

	const sandboxInfo = {
		sandboxId: sandbox.sandboxId,
		status: sandbox.status,
		timeout: sandbox.timeout,
		createdAt: sandbox.createdAt.toISOString(),
	};
	console.log(`[sandbox] ${JSON.stringify(sandboxInfo, null, 2)}`);

	if (snapshot.status !== "created") {
		console.warn(
			`[warning] unexpected snapshot status: ${snapshot.status} (expected: created)`,
		);
		process.exitCode = 1;
	}

	return snapshot;
}

main().then((snapshot) => {
	console.log(`[result] snapshot created: ${snapshot.snapshotId}`);
	return;
});
