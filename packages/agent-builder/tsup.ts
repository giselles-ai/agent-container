import { defineConfig } from "tsup";

export default defineConfig([
	{
		entry: ["src/index.ts", "src/next/index.ts", "src/next-server/index.ts"],
		outDir: "dist",
		format: ["esm"],
		dts: true,
	},
]);
