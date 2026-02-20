import { defineConfig } from "tsup";

export default defineConfig([
	{
		entry: ["src/index.ts"],
		outDir: "dist",
		format: ["esm"],
		dts: true,
	},
	{
		entry: ["src/dom/index.ts"],
		outDir: "dist/dom",
		format: ["esm"],
		dts: true,
	},
	{
		entry: ["src/mcp-server/index.ts"],
		outDir: "dist/mcp-server",
		format: ["esm"],
		dts: true,
	},
	{
		entry: ["src/relay/index.ts"],
		outDir: "dist/relay",
		format: ["esm"],
		dts: true,
	},
]);
