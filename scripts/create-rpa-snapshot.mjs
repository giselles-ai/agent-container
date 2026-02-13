#!/usr/bin/env node

import { spawn } from "node:child_process";

const child = spawn(
  "pnpm",
  ["--filter", "demo", "exec", "node", "scripts/create-rpa-snapshot.mjs"],
  {
    stdio: "inherit",
    shell: process.platform === "win32"
  }
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
