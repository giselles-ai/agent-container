import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts"],
    outDir: "dist",
    format: ["esm"],
    dts: true,
    clean: true
  },
  {
    entry: ["src/react/index.ts"],
    outDir: "dist/react",
    format: ["esm"],
    dts: true,
    clean: false
  }
]);
