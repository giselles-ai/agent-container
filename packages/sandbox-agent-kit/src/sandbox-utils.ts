import type { Sandbox } from "@vercel/sandbox";

export async function runCommandOrThrow(
	sandbox: Sandbox,
	input: {
		cmd: string;
		args?: string[];
		cwd?: string;
		env?: Record<string, string>;
	},
) {
	const result = await sandbox.runCommand({
		cmd: input.cmd,
		args: input.args,
		cwd: input.cwd,
		env: input.env,
	});

	const stdout = await result.stdout().catch(() => "");
	const stderr = await result.stderr().catch(() => "");

	if (result.exitCode !== 0) {
		const errorLines = [
			`Command failed: ${input.cmd} ${(input.args ?? []).join(" ")}`,
			`Exit code: ${result.exitCode}`,
		];

		if (stdout.trim().length > 0) {
			errorLines.push(`stdout:\n${stdout}`);
		}

		if (stderr.trim().length > 0) {
			errorLines.push(`stderr:\n${stderr}`);
		}

		throw new Error(errorLines.join("\n\n"));
	}

	return { stdout, stderr };
}
