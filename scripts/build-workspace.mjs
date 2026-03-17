import { spawnSync } from "node:child_process";

const targets = [
	"@giselles-ai/browser-tool",
	"@giselles-ai/giselle-provider",
	"@giselles-ai/agent",
	"@giselles-ai/agent-kit",
	"web",
	"cloud-chat-runner",
];

for (const target of targets) {
	console.log(`\n==> Building ${target}`);

	const result = spawnSync("pnpm", ["--filter", target, "run", "build"], {
		stdio: "inherit",
		shell: process.platform === "win32",
	});

	if (result.status !== 0) {
		process.exit(result.status ?? 1);
	}
}
