import { defineConfig } from "tsup";

export default defineConfig([
	{
		entry: ["src/index.ts"],
		outDir: "dist",
		format: ["esm"],
		dts: true,
	},
	{
		entry: ["src/cli.ts"],
		outDir: "dist",
		format: ["esm"],
		banner: { js: "#!/usr/bin/env node" },
	},
]);
