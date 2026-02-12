import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Sandbox } from "@vercel/sandbox";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  type BridgeRequest,
  type RpaAction,
  type SnapshotField
} from "@giselles/rpa-sdk";

type BridgeDispatchBody = {
  sessionId: string;
  token: string;
  timeoutMs?: number;
  request: BridgeRequest;
};

type CliMode = "discovery" | "fill";
type CliTarget = "local" | "sandbox";

type CliOptions = {
  mode: CliMode;
  target: CliTarget;
  instruction: string;
  mcpServerPath: string;
  skipBuild: boolean;
  realPlanner: boolean;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageRoot = resolve(__dirname, "..");
const repoRoot = resolve(packageRoot, "../..");
const defaultMcpServerPath = resolve(repoRoot, "packages/mcp-server/dist/index.js");

const sampleFields: SnapshotField[] = [
  {
    fieldId: "rpa:title",
    selector: "#title",
    kind: "text",
    label: "Title",
    required: true,
    currentValue: ""
  },
  {
    fieldId: "rpa:body",
    selector: "#body",
    kind: "textarea",
    label: "Body",
    required: false,
    currentValue: ""
  },
  {
    fieldId: "rpa:category",
    selector: "#category",
    kind: "select",
    label: "Category",
    required: false,
    currentValue: "",
    options: ["General", "News", "Internal"]
  }
];

const SANDBOX_CHECK_SCRIPT = String.raw`
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname } from "node:path";
import { createInterface } from "node:readline";

const REQUEST_TIMEOUT_MS = 15000;
const PROTOCOL_VERSION = "2025-11-25";

const sampleFields = [
  {
    fieldId: "rpa:title",
    selector: "#title",
    kind: "text",
    label: "Title",
    required: true,
    currentValue: ""
  },
  {
    fieldId: "rpa:body",
    selector: "#body",
    kind: "textarea",
    label: "Body",
    required: false,
    currentValue: ""
  },
  {
    fieldId: "rpa:category",
    selector: "#category",
    kind: "select",
    label: "Category",
    required: false,
    currentValue: "",
    options: ["General", "News", "Internal"]
  }
];

function isRecord(value) {
  return typeof value === "object" && value !== null;
}

function extractTextContent(value) {
  if (!Array.isArray(value)) {
    return "";
  }

  const lines = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }
    if (entry.type !== "text" || typeof entry.text !== "string") {
      continue;
    }
    lines.push(entry.text);
  }

  return lines.join("\n");
}

async function readJsonFromReq(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (raw.length === 0) {
    return null;
  }
  return JSON.parse(raw);
}

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function createJsonRpcClient(child) {
  let requestId = 1;
  const pending = new Map();

  const rl = createInterface({ input: child.stdout });
  rl.on("line", (line) => {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      process.stderr.write("[sandbox-smoke] non-json stdout from mcp-server: " + line + "\n");
      return;
    }

    if (!isRecord(message)) {
      return;
    }

    if (typeof message.id !== "number") {
      return;
    }

    const resolver = pending.get(message.id);
    if (!resolver) {
      return;
    }

    pending.delete(message.id);

    if (isRecord(message.error)) {
      const detail = typeof message.error.message === "string" ? message.error.message : "JSON-RPC error";
      resolver.reject(new Error(detail));
      return;
    }

    resolver.resolve(message.result);
  });

  const rejectAll = (reason) => {
    for (const { reject, timer } of pending.values()) {
      clearTimeout(timer);
      reject(reason);
    }
    pending.clear();
  };

  child.on("error", (error) => {
    rejectAll(error instanceof Error ? error : new Error(String(error)));
  });

  child.on("exit", (code, signal) => {
    if (pending.size === 0) {
      return;
    }
    rejectAll(new Error("mcp-server exited before response (code=" + code + ", signal=" + signal + ")"));
  });

  function notify(method, params) {
    const payload = { jsonrpc: "2.0", method };
    if (params !== undefined) {
      payload.params = params;
    }
    child.stdin.write(JSON.stringify(payload) + "\n");
  }

  function request(method, params) {
    const id = requestId++;
    const payload = { jsonrpc: "2.0", id, method };
    if (params !== undefined) {
      payload.params = params;
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error("Request timed out: " + method));
      }, REQUEST_TIMEOUT_MS);

      pending.set(id, {
        resolve: (result) => {
          clearTimeout(timer);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
        timer
      });

      child.stdin.write(JSON.stringify(payload) + "\n");
    });
  }

  function close() {
    rl.close();
    child.stdin.end();
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }

  return { request, notify, close };
}

async function main() {
  const mode = (process.env.RPA_SMOKE_MODE || "fill").trim();
  const instruction =
    process.env.RPA_SMOKE_INSTRUCTION || "Fill the title with Hello from sandbox smoke check";
  const mcpServerDistPath = process.env.RPA_MCP_SERVER_DIST_PATH;

  if (!mcpServerDistPath) {
    throw new Error("Missing RPA_MCP_SERVER_DIST_PATH in sandbox.");
  }

  await access(mcpServerDistPath, constants.R_OK).catch(() => {
    throw new Error("MCP server dist not found in sandbox: " + mcpServerDistPath);
  });

  const bridgeSessionId = "sandbox-smoke-" + randomUUID();
  const bridgeToken = randomUUID();

  const bridge = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      if (req.method !== "POST" || url.pathname !== "/api/gemini-rpa/bridge/dispatch") {
        sendJson(res, 404, { ok: false, errorCode: "NOT_FOUND", message: "Not found" });
        return;
      }

      const body = await readJsonFromReq(req);
      if (!isRecord(body) || !isRecord(body.request)) {
        sendJson(res, 400, {
          ok: false,
          errorCode: "INVALID_RESPONSE",
          message: "Invalid dispatch payload."
        });
        return;
      }

      if (body.sessionId !== bridgeSessionId || body.token !== bridgeToken) {
        sendJson(res, 401, {
          ok: false,
          errorCode: "UNAUTHORIZED",
          message: "Invalid bridge credentials."
        });
        return;
      }

      if (body.request.type === "snapshot_request") {
        sendJson(res, 200, {
          ok: true,
          response: {
            type: "snapshot_response",
            requestId: body.request.requestId,
            fields: sampleFields
          }
        });
        return;
      }

      if (body.request.type !== "execute_request") {
        sendJson(res, 400, {
          ok: false,
          errorCode: "INVALID_RESPONSE",
          message: "Unsupported request type."
        });
        return;
      }

      const knownFieldIds = new Set(sampleFields.map((field) => field.fieldId));
      let applied = 0;
      let skipped = 0;
      const warnings = [];

      if (!Array.isArray(body.request.actions)) {
        sendJson(res, 400, {
          ok: false,
          errorCode: "INVALID_RESPONSE",
          message: "actions must be array."
        });
        return;
      }

      for (const action of body.request.actions) {
        if (!isRecord(action) || typeof action.fieldId !== "string") {
          skipped += 1;
          warnings.push("Malformed action skipped.");
          continue;
        }

        if (!knownFieldIds.has(action.fieldId)) {
          skipped += 1;
          warnings.push("Unknown fieldId skipped: " + action.fieldId);
          continue;
        }

        applied += 1;
      }

      sendJson(res, 200, {
        ok: true,
        response: {
          type: "execute_response",
          requestId: body.request.requestId,
          report: {
            applied,
            skipped,
            warnings
          }
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected bridge error";
      sendJson(res, 500, { ok: false, errorCode: "INTERNAL", message });
    }
  });

  await new Promise((resolve, reject) => {
    bridge.once("error", reject);
    bridge.listen(0, "127.0.0.1", () => resolve());
  });

  const address = bridge.address();
  if (!address || typeof address === "string") {
    throw new Error("Bridge failed to bind local port.");
  }

  const bridgeBaseUrl = "http://127.0.0.1:" + address.port;

  const env = {
    ...process.env,
    RPA_BRIDGE_BASE_URL: bridgeBaseUrl,
    RPA_BRIDGE_SESSION_ID: bridgeSessionId,
    RPA_BRIDGE_TOKEN: bridgeToken
  };

  const child = spawn("node", [mcpServerDistPath], {
    cwd: dirname(mcpServerDistPath),
    env,
    stdio: ["pipe", "pipe", "pipe"]
  });

  child.stderr.on("data", (chunk) => {
    process.stderr.write("[mcp-server] " + String(chunk));
  });

  const mcp = createJsonRpcClient(child);

  try {
    await mcp.request("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "giselles-mcp-sandbox-smoke-client", version: "0.1.0" }
    });

    mcp.notify("notifications/initialized");
    process.stdout.write("[sandbox-smoke] connected\n");

    const toolsResult = await mcp.request("tools/list", {});
    const toolNames = Array.isArray(toolsResult?.tools)
      ? toolsResult.tools
          .filter((tool) => isRecord(tool) && typeof tool.name === "string")
          .map((tool) => tool.name)
      : [];

    process.stdout.write("[sandbox-smoke] tools: " + (toolNames.join(", ") || "(none)") + "\n");

    if (!toolNames.includes("fillForm")) {
      throw new Error("fillForm tool was not discovered.");
    }

    if (mode === "fill") {
      const callResult = await mcp.request("tools/call", {
        name: "fillForm",
        arguments: { instruction }
      });

      if (callResult?.isError) {
        const detail = extractTextContent(callResult?.content);
        throw new Error("fillForm returned an error: " + (detail || "(no text content)"));
      }

      process.stdout.write("[sandbox-smoke] fillForm call succeeded\n");
      process.stdout.write(JSON.stringify(callResult?.structuredContent ?? callResult?.content, null, 2));
      process.stdout.write("\n");
    }

    process.stdout.write("[sandbox-smoke] PASS\n");
  } finally {
    mcp.close();
    await new Promise((resolve) => bridge.close(() => resolve()));
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  process.stderr.write("[sandbox-smoke] FAIL: " + message + "\n");
  process.exitCode = 1;
});
`;

function usage(): string {
  return [
    "Usage: pnpm mcp:check [-- --target <local|sandbox> --mode <discovery|fill>]",
    "",
    "Options:",
    "  --target <value>          local | sandbox (default: local)",
    "  --sandbox                 shorthand for --target sandbox",
    "  --mode <value>            discovery | fill (default: fill)",
    "  --instruction <text>      instruction for fillForm",
    "  --mcp-path <path>         override MCP server dist path (local target)",
    "  --real-planner            use real planner (requires AI_GATEWAY_API_KEY or OPENAI_API_KEY)",
    "  --skip-build              skip local planner/mcp-server build step",
    "  --help                    show this help",
    "",
    "Sandbox mode required env:",
    "  RPA_SANDBOX_SNAPSHOT_ID",
    "Optional sandbox env:",
    "  RPA_SANDBOX_REPO_ROOT (default: /vercel/sandbox)",
    "  RPA_MCP_SERVER_DIST_PATH (default: <repoRoot>/packages/mcp-server/dist/index.js)",
    "  RPA_SANDBOX_SMOKE_TIMEOUT_MS (default: 300000)",
    "  RPA_SMOKE_KEEP_SANDBOX=1 (keep sandbox running after check)"
  ].join("\n");
}

function parseMode(value: string): CliMode {
  if (value === "discovery" || value === "fill") {
    return value;
  }
  throw new Error(`Invalid mode: ${value}`);
}

function parseTarget(value: string): CliTarget {
  if (value === "local" || value === "sandbox") {
    return value;
  }
  throw new Error(`Invalid target: ${value}`);
}

function parseArgs(argv: string[]): CliOptions {
  let mode: CliMode = "fill";
  let target: CliTarget = "local";
  let instruction = "Fill the title with Hello from mcp smoke check";
  let mcpServerPath = defaultMcpServerPath;
  let skipBuild = false;
  let realPlanner = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (!arg) {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      process.stdout.write(`${usage()}\n`);
      process.exit(0);
    }

    if (arg === "--skip-build") {
      skipBuild = true;
      continue;
    }

    if (arg === "--real-planner") {
      realPlanner = true;
      continue;
    }

    if (arg === "--sandbox") {
      target = "sandbox";
      continue;
    }

    if (arg === "--mode") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("Missing value for --mode");
      }
      mode = parseMode(value);
      index += 1;
      continue;
    }

    if (arg.startsWith("--mode=")) {
      mode = parseMode(arg.slice("--mode=".length));
      continue;
    }

    if (arg === "--target") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("Missing value for --target");
      }
      target = parseTarget(value);
      index += 1;
      continue;
    }

    if (arg.startsWith("--target=")) {
      target = parseTarget(arg.slice("--target=".length));
      continue;
    }

    if (arg === "--instruction") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("Missing value for --instruction");
      }
      instruction = value;
      index += 1;
      continue;
    }

    if (arg.startsWith("--instruction=")) {
      instruction = arg.slice("--instruction=".length);
      continue;
    }

    if (arg === "--mcp-path") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("Missing value for --mcp-path");
      }
      mcpServerPath = resolve(value);
      index += 1;
      continue;
    }

    if (arg.startsWith("--mcp-path=")) {
      mcpServerPath = resolve(arg.slice("--mcp-path=".length));
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    mode,
    target,
    instruction,
    mcpServerPath,
    skipBuild,
    realPlanner
  };
}

function isTruthy(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function readRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseTimeoutMs(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid timeout value: ${value}`);
  }

  return Math.floor(parsed);
}

function runOrThrow(input: { cmd: string; args: string[]; cwd: string }): void {
  const result = spawnSync(input.cmd, input.args, {
    cwd: input.cwd,
    stdio: "inherit"
  });

  if (result.status !== 0) {
    throw new Error(
      `Command failed (${input.cmd} ${input.args.join(" ")}), exit=${result.status ?? "unknown"}`
    );
  }
}

function ensureBuildArtifacts(input: { mcpServerPath: string; skipBuild: boolean }): void {
  if (!input.skipBuild) {
    process.stdout.write("[smoke] building @giselles/rpa-planner ...\n");
    runOrThrow({
      cmd: "pnpm",
      args: ["--dir", repoRoot, "--filter", "@giselles/rpa-planner", "run", "build"],
      cwd: repoRoot
    });

    process.stdout.write("[smoke] building @giselles/mcp-server ...\n");
    runOrThrow({
      cmd: "pnpm",
      args: ["--dir", repoRoot, "--filter", "@giselles/mcp-server", "run", "build"],
      cwd: repoRoot
    });
  }

  if (!existsSync(input.mcpServerPath)) {
    throw new Error(`MCP server dist file not found: ${input.mcpServerPath}`);
  }
}

function toJsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asAction(value: unknown): RpaAction | null {
  if (!isRecord(value)) {
    return null;
  }

  const action = value.action;
  const fieldId = value.fieldId;

  if (typeof action !== "string" || typeof fieldId !== "string") {
    return null;
  }

  if (action === "click") {
    return { action, fieldId };
  }

  const payloadValue = value.value;
  if (typeof payloadValue !== "string") {
    return null;
  }

  if (action === "fill") {
    return { action, fieldId, value: payloadValue };
  }

  if (action === "select") {
    return { action, fieldId, value: payloadValue };
  }

  return null;
}

function asSnapshotField(value: unknown): SnapshotField | null {
  if (!isRecord(value)) {
    return null;
  }

  const fieldId = value.fieldId;
  const selector = value.selector;
  const kind = value.kind;
  const label = value.label;
  const required = value.required;
  const currentValue = value.currentValue;

  if (
    typeof fieldId !== "string" ||
    typeof selector !== "string" ||
    typeof label !== "string" ||
    typeof required !== "boolean" ||
    (typeof currentValue !== "string" && typeof currentValue !== "boolean")
  ) {
    return null;
  }

  if (!["text", "textarea", "select", "checkbox", "radio"].includes(String(kind))) {
    return null;
  }

  const options =
    Array.isArray(value.options) && value.options.every((entry) => typeof entry === "string")
      ? (value.options as string[])
      : undefined;

  return {
    fieldId,
    selector,
    kind: kind as SnapshotField["kind"],
    label,
    required,
    currentValue,
    options
  };
}

function parseDispatchBody(value: unknown): BridgeDispatchBody | null {
  if (!isRecord(value)) {
    return null;
  }

  if (typeof value.sessionId !== "string" || typeof value.token !== "string") {
    return null;
  }

  if (!isRecord(value.request)) {
    return null;
  }

  const requestType = value.request.type;
  const requestId = value.request.requestId;
  if (typeof requestType !== "string" || typeof requestId !== "string") {
    return null;
  }

  if (requestType === "snapshot_request") {
    const instruction = value.request.instruction;
    const document = value.request.document;
    if (typeof instruction !== "string") {
      return null;
    }
    if (document !== undefined && typeof document !== "string") {
      return null;
    }

    return {
      sessionId: value.sessionId,
      token: value.token,
      timeoutMs: typeof value.timeoutMs === "number" ? value.timeoutMs : undefined,
      request: {
        type: "snapshot_request",
        requestId,
        instruction,
        document
      }
    };
  }

  if (requestType === "execute_request") {
    const actionsRaw = value.request.actions;
    const fieldsRaw = value.request.fields;

    if (!Array.isArray(actionsRaw) || !Array.isArray(fieldsRaw)) {
      return null;
    }

    const actions: RpaAction[] = [];
    for (const entry of actionsRaw) {
      const parsed = asAction(entry);
      if (!parsed) {
        return null;
      }
      actions.push(parsed);
    }

    const fields: SnapshotField[] = [];
    for (const entry of fieldsRaw) {
      const parsed = asSnapshotField(entry);
      if (!parsed) {
        return null;
      }
      fields.push(parsed);
    }

    return {
      sessionId: value.sessionId,
      token: value.token,
      timeoutMs: typeof value.timeoutMs === "number" ? value.timeoutMs : undefined,
      request: {
        type: "execute_request",
        requestId,
        actions,
        fields
      }
    };
  }

  return null;
}

async function readNodeJsonBody(nodeRequest: AsyncIterable<Buffer | string>): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of nodeRequest) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  const bodyText = Buffer.concat(chunks).toString("utf8");
  if (bodyText.length === 0) {
    return null;
  }

  return JSON.parse(bodyText) as unknown;
}

async function startMockBridge(input: {
  sessionId: string;
  token: string;
}): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = createServer(async (nodeRequest, nodeResponse) => {
    try {
      const url = new URL(nodeRequest.url ?? "/", "http://127.0.0.1");
      if (nodeRequest.method !== "POST" || url.pathname !== "/api/gemini-rpa/bridge/dispatch") {
        nodeResponse.writeHead(404, { "content-type": "application/json" });
        nodeResponse.end(JSON.stringify({ ok: false, errorCode: "NOT_FOUND", message: "Not found" }));
        return;
      }

      const parsedBody = parseDispatchBody(await readNodeJsonBody(nodeRequest));

      if (!parsedBody) {
        const response = toJsonResponse(400, {
          ok: false,
          errorCode: "INVALID_RESPONSE",
          message: "Invalid dispatch payload."
        });
        nodeResponse.writeHead(response.status, Object.fromEntries(response.headers.entries()));
        nodeResponse.end(await response.text());
        return;
      }

      if (parsedBody.sessionId !== input.sessionId || parsedBody.token !== input.token) {
        const response = toJsonResponse(401, {
          ok: false,
          errorCode: "UNAUTHORIZED",
          message: "Invalid bridge credentials."
        });
        nodeResponse.writeHead(response.status, Object.fromEntries(response.headers.entries()));
        nodeResponse.end(await response.text());
        return;
      }

      if (parsedBody.request.type === "snapshot_request") {
        const response = toJsonResponse(200, {
          ok: true,
          response: {
            type: "snapshot_response",
            requestId: parsedBody.request.requestId,
            fields: sampleFields
          }
        });
        nodeResponse.writeHead(response.status, Object.fromEntries(response.headers.entries()));
        nodeResponse.end(await response.text());
        return;
      }

      const allowedFieldIds = new Set(parsedBody.request.fields.map((field) => field.fieldId));
      let applied = 0;
      let skipped = 0;
      const warnings: string[] = [];

      for (const action of parsedBody.request.actions) {
        if (!allowedFieldIds.has(action.fieldId)) {
          skipped += 1;
          warnings.push(`Unknown fieldId skipped: ${action.fieldId}`);
          continue;
        }

        applied += 1;
      }

      const response = toJsonResponse(200, {
        ok: true,
        response: {
          type: "execute_response",
          requestId: parsedBody.request.requestId,
          report: {
            applied,
            skipped,
            warnings
          }
        }
      });

      nodeResponse.writeHead(response.status, Object.fromEntries(response.headers.entries()));
      nodeResponse.end(await response.text());
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected bridge error";
      nodeResponse.writeHead(500, { "content-type": "application/json" });
      nodeResponse.end(JSON.stringify({ ok: false, errorCode: "INTERNAL", message }));
    }
  });

  await new Promise<void>((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(0, "127.0.0.1", () => {
      resolvePromise();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to allocate mock bridge port.");
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    close: async () =>
      new Promise<void>((resolvePromise, rejectPromise) => {
        server.close((error) => {
          if (error) {
            rejectPromise(error);
            return;
          }
          resolvePromise();
        });
      })
  };
}

function inheritedEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") {
      env[key] = value;
    }
  }
  return env;
}

function extractTextContent(value: unknown): string {
  if (!Array.isArray(value)) {
    return "";
  }

  const lines: string[] = [];

  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }
    if (entry.type !== "text" || typeof entry.text !== "string") {
      continue;
    }
    lines.push(entry.text);
  }

  return lines.join("\n");
}

async function runLocalSmoke(options: CliOptions): Promise<void> {
  ensureBuildArtifacts({
    mcpServerPath: options.mcpServerPath,
    skipBuild: options.skipBuild
  });

  const hasPlannerAuth =
    !!process.env.AI_GATEWAY_API_KEY?.trim() || !!process.env.OPENAI_API_KEY?.trim();

  if (options.realPlanner && options.mode === "fill" && !hasPlannerAuth) {
    throw new Error(
      "AI_GATEWAY_API_KEY or OPENAI_API_KEY is required when --real-planner is set."
    );
  }

  const bridgeSessionId = `smoke-${randomUUID()}`;
  const bridgeToken = randomUUID();
  const bridge = await startMockBridge({
    sessionId: bridgeSessionId,
    token: bridgeToken
  });

  process.stdout.write(`[smoke] mock bridge: ${bridge.baseUrl}\n`);
  process.stdout.write(`[smoke] MCP server: ${options.mcpServerPath}\n`);

  const env = inheritedEnv();
  env.RPA_BRIDGE_BASE_URL = bridge.baseUrl;
  env.RPA_BRIDGE_SESSION_ID = bridgeSessionId;
  env.RPA_BRIDGE_TOKEN = bridgeToken;
  env.RPA_MCP_MOCK_PLAN = options.realPlanner ? "0" : "1";

  const transport = new StdioClientTransport({
    command: "node",
    args: [options.mcpServerPath],
    cwd: dirname(options.mcpServerPath),
    env,
    stderr: "pipe"
  });

  transport.stderr?.on("data", (chunk: Buffer | string) => {
    process.stderr.write(`[mcp-server] ${String(chunk)}`);
  });

  const client = new Client({
    name: "giselles-mcp-smoke-client",
    version: "0.1.0"
  });

  try {
    await client.connect(transport);
    process.stdout.write("[smoke] connected to MCP server\n");

    const toolsResult = await client.listTools();
    const toolNames = toolsResult.tools.map((tool) => tool.name);
    process.stdout.write(`[smoke] tools: ${toolNames.join(", ") || "(none)"}\n`);

    if (!toolNames.includes("fillForm")) {
      throw new Error("fillForm tool was not discovered.");
    }

    if (options.mode === "fill") {
      const result = await client.callTool({
        name: "fillForm",
        arguments: {
          instruction: options.instruction
        }
      });

      if (result.isError) {
        const detail = extractTextContent(result.content);
        throw new Error(`fillForm returned an error: ${detail || "(no text content)"}`);
      }

      process.stdout.write("[smoke] fillForm call succeeded\n");
      const payload = result.structuredContent ?? result.content;
      process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    }
  } finally {
    await transport.close().catch(() => undefined);
    await bridge.close().catch(() => undefined);
  }

  process.stdout.write("[smoke] PASS\n");
}

async function runSandboxSmoke(options: CliOptions): Promise<void> {
  const snapshotId = readRequiredEnv("RPA_SANDBOX_SNAPSHOT_ID");
  const repoRootInSandbox = process.env.RPA_SANDBOX_REPO_ROOT?.trim() || "/vercel/sandbox";
  const mcpServerDistPathInSandbox =
    process.env.RPA_MCP_SERVER_DIST_PATH?.trim() ||
    `${repoRootInSandbox}/packages/mcp-server/dist/index.js`;
  const timeoutMs = parseTimeoutMs(process.env.RPA_SANDBOX_SMOKE_TIMEOUT_MS, 300_000);
  const keepSandbox = isTruthy(process.env.RPA_SMOKE_KEEP_SANDBOX);

  const gatewayApiKey = process.env.AI_GATEWAY_API_KEY?.trim();
  const openAiApiKey = process.env.OPENAI_API_KEY?.trim();
  const hasPlannerAuth = !!gatewayApiKey || !!openAiApiKey;

  if (options.realPlanner && !hasPlannerAuth) {
    throw new Error(
      "AI_GATEWAY_API_KEY or OPENAI_API_KEY is required when --real-planner is set."
    );
  }

  process.stdout.write(`[smoke:sandbox] creating sandbox from snapshot: ${snapshotId}\n`);
  const sandbox = await Sandbox.create({
    source: { type: "snapshot", snapshotId },
    timeout: timeoutMs
  });

  process.stdout.write(`[smoke:sandbox] sandboxId: ${sandbox.sandboxId}\n`);

  try {
    const scriptDir = `${repoRootInSandbox}/.tmp`;
    const scriptPath = `${scriptDir}/giselles-mcp-sandbox-smoke.mjs`;

    await sandbox.mkDir(scriptDir);

    await sandbox.writeFiles([
      {
        path: scriptPath,
        content: Buffer.from(SANDBOX_CHECK_SCRIPT, "utf8")
      }
    ]);

    const env: Record<string, string> = {
      RPA_SMOKE_MODE: options.mode,
      RPA_SMOKE_INSTRUCTION: options.instruction,
      RPA_MCP_MOCK_PLAN: options.realPlanner ? "0" : "1",
      RPA_MCP_SERVER_DIST_PATH: mcpServerDistPathInSandbox
    };

    if (gatewayApiKey) {
      env.AI_GATEWAY_API_KEY = gatewayApiKey;
    }

    if (openAiApiKey) {
      env.OPENAI_API_KEY = openAiApiKey;
    }

    const command = await sandbox.runCommand({
      cmd: "node",
      args: [scriptPath],
      cwd: repoRootInSandbox,
      env
    });

    const [stdout, stderr] = await Promise.all([
      command.stdout().catch(() => ""),
      command.stderr().catch(() => "")
    ]);

    if (stdout.trim().length > 0) {
      process.stdout.write(stdout.endsWith("\n") ? stdout : `${stdout}\n`);
    }
    if (stderr.trim().length > 0) {
      process.stderr.write(stderr.endsWith("\n") ? stderr : `${stderr}\n`);
    }

    if (command.exitCode !== 0) {
      const combined = `${stdout}\n${stderr}`;

      if (
        options.mode === "fill" &&
        !options.realPlanner &&
        combined.includes("Unauthenticated request to AI Gateway")
      ) {
        throw new Error(
          [
            "Sandbox fill smoke failed because snapshot likely contains an older mcp-server build",
            "that does not support RPA_MCP_MOCK_PLAN.",
            "Rebuild and snapshot the latest mcp-server, or run discovery-only check:",
            "pnpm mcp:check:sandbox:discovery"
          ].join(" ")
        );
      }

      throw new Error(`Sandbox smoke script failed with exit code ${command.exitCode}.`);
    }

    process.stdout.write("[smoke:sandbox] PASS\n");
  } finally {
    if (keepSandbox) {
      process.stdout.write(
        `[smoke:sandbox] keeping sandbox alive due to RPA_SMOKE_KEEP_SANDBOX=1: ${sandbox.sandboxId}\n`
      );
    } else {
      await sandbox.stop().catch(() => undefined);
      process.stdout.write("[smoke:sandbox] sandbox stopped\n");
    }
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (options.target === "sandbox") {
    await runSandboxSmoke(options);
    return;
  }

  await runLocalSmoke(options);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`[smoke] FAIL: ${message}\n`);
  process.exitCode = 1;
});
