import { defineConfig } from "tsup";

export default defineConfig([
	{
		entry: ["src/index.ts"],
		outDir: "dist",
		format: ["esm"],
		dts: true,
		clean: true,
	},
	{
		entry: ["src/dom/index.ts"],
		outDir: "dist/dom",
		format: ["esm"],
		dts: true,
		clean: false,
	},
	{
		entry: ["src/planner/index.ts"],
		outDir: "dist/planner",
		format: ["esm"],
		dts: true,
		clean: false,
	},
	{
		entry: ["src/mcp-server/index.ts"],
		outDir: "dist/mcp-server",
		format: ["esm"],
		dts: true,
		clean: false,
	},
]);
