import { randomUUID } from "node:crypto";
import type { BridgeErrorCode, BridgeRequest, BridgeResponse } from "./bridge-types";

const DEFAULT_SESSION_TTL_MS = 10 * 60 * 1000;
const DEFAULT_DISPATCH_TIMEOUT_MS = 20 * 1000;
const KEEPALIVE_INTERVAL_MS = 20 * 1000;

const encoder = new TextEncoder();

type PendingRequest = {
  requestType: BridgeRequest["type"];
  timeoutId: ReturnType<typeof setTimeout>;
  resolve: (response: BridgeResponse) => void;
  reject: (error: BridgeBrokerError) => void;
};

type BrowserStream = {
  controller: ReadableStreamDefaultController<Uint8Array>;
  keepaliveId: ReturnType<typeof setInterval>;
};

type BridgeSession = {
  sessionId: string;
  token: string;
  expiresAt: number;
  browserStream: BrowserStream | null;
  pendingRequests: Map<string, PendingRequest>;
};

type BridgeState = {
  sessions: Map<string, BridgeSession>;
};

declare global {
  // biome-ignore lint/style/noVar: global singleton state for local in-memory broker
  var __geminiRpaBridgeState: BridgeState | undefined;
}

export class BridgeBrokerError extends Error {
  readonly code: BridgeErrorCode;
  readonly status: number;

  constructor(code: BridgeErrorCode, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function createBridgeError(code: BridgeErrorCode, message: string): BridgeBrokerError {
  switch (code) {
    case "UNAUTHORIZED":
      return new BridgeBrokerError(code, message, 401);
    case "NO_BROWSER":
      return new BridgeBrokerError(code, message, 409);
    case "TIMEOUT":
      return new BridgeBrokerError(code, message, 408);
    case "INVALID_RESPONSE":
      return new BridgeBrokerError(code, message, 422);
    case "NOT_FOUND":
      return new BridgeBrokerError(code, message, 404);
    case "INTERNAL":
      return new BridgeBrokerError(code, message, 500);
    default:
      return new BridgeBrokerError("INTERNAL", message, 500);
  }
}

function getBridgeState(): BridgeState {
  if (!globalThis.__geminiRpaBridgeState) {
    globalThis.__geminiRpaBridgeState = {
      sessions: new Map()
    };
  }

  return globalThis.__geminiRpaBridgeState;
}

function sendSseData(
  controller: ReadableStreamDefaultController<Uint8Array>,
  payload: unknown
): void {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
}

function sendSseComment(
  controller: ReadableStreamDefaultController<Uint8Array>,
  comment: string
): void {
  controller.enqueue(encoder.encode(`: ${comment}\n\n`));
}

function touchSession(session: BridgeSession): void {
  session.expiresAt = Date.now() + DEFAULT_SESSION_TTL_MS;
}

function rejectAllPending(session: BridgeSession, error: BridgeBrokerError): void {
  for (const [requestId, pending] of session.pendingRequests.entries()) {
    clearTimeout(pending.timeoutId);
    session.pendingRequests.delete(requestId);
    pending.reject(error);
  }
}

function closeBrowserStream(session: BridgeSession): void {
  if (!session.browserStream) {
    return;
  }

  clearInterval(session.browserStream.keepaliveId);

  try {
    session.browserStream.controller.close();
  } catch {
    // Stream may already be closed.
  }

  session.browserStream = null;
}

function cleanupExpiredSessions(): void {
  const state = getBridgeState();
  const now = Date.now();

  for (const [sessionId, session] of state.sessions.entries()) {
    if (session.expiresAt > now) {
      continue;
    }

    closeBrowserStream(session);
    rejectAllPending(
      session,
      createBridgeError("TIMEOUT", "Bridge session expired before receiving a browser response.")
    );
    state.sessions.delete(sessionId);
  }
}

function getAuthorizedSession(sessionId: string, token: string): BridgeSession {
  cleanupExpiredSessions();

  const state = getBridgeState();
  const session = state.sessions.get(sessionId);

  if (!session || session.token !== token) {
    throw createBridgeError("UNAUTHORIZED", "Invalid bridge session credentials.");
  }

  touchSession(session);
  return session;
}

export function createBridgeSession(): { sessionId: string; token: string; expiresAt: number } {
  cleanupExpiredSessions();

  const sessionId = randomUUID();
  const token = `${randomUUID()}-${randomUUID()}`;
  const expiresAt = Date.now() + DEFAULT_SESSION_TTL_MS;

  getBridgeState().sessions.set(sessionId, {
    sessionId,
    token,
    expiresAt,
    browserStream: null,
    pendingRequests: new Map()
  });

  return {
    sessionId,
    token,
    expiresAt
  };
}

export function assertBridgeSession(sessionId: string, token: string): void {
  getAuthorizedSession(sessionId, token);
}

export function attachBridgeBrowserStream(
  sessionId: string,
  token: string,
  controller: ReadableStreamDefaultController<Uint8Array>
): void {
  const session = getAuthorizedSession(sessionId, token);

  if (session.browserStream) {
    closeBrowserStream(session);
    rejectAllPending(
      session,
      createBridgeError("NO_BROWSER", "Bridge browser stream was replaced before request completion.")
    );
  }

  const keepaliveId = setInterval(() => {
    try {
      sendSseComment(controller, "keepalive");
    } catch {
      clearInterval(keepaliveId);
    }
  }, KEEPALIVE_INTERVAL_MS);

  session.browserStream = {
    controller,
    keepaliveId
  };

  sendSseData(controller, {
    type: "ready",
    sessionId: session.sessionId
  });
}

export function detachBridgeBrowserStream(
  sessionId: string,
  controller?: ReadableStreamDefaultController<Uint8Array>
): void {
  cleanupExpiredSessions();

  const session = getBridgeState().sessions.get(sessionId);
  if (!session || !session.browserStream) {
    return;
  }

  if (controller && session.browserStream.controller !== controller) {
    return;
  }

  closeBrowserStream(session);
  rejectAllPending(
    session,
    createBridgeError("NO_BROWSER", "Browser disconnected before request completion.")
  );
}

export async function dispatchBridgeRequest(input: {
  sessionId: string;
  token: string;
  request: BridgeRequest;
  timeoutMs?: number;
}): Promise<BridgeResponse> {
  const session = getAuthorizedSession(input.sessionId, input.token);

  if (!session.browserStream) {
    throw createBridgeError("NO_BROWSER", "No browser client is connected to this bridge session.");
  }

  if (session.pendingRequests.has(input.request.requestId)) {
    throw createBridgeError(
      "INVALID_RESPONSE",
      `Request id is already pending: ${input.request.requestId}`
    );
  }

  const timeoutMs = input.timeoutMs ?? DEFAULT_DISPATCH_TIMEOUT_MS;

  return await new Promise<BridgeResponse>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      session.pendingRequests.delete(input.request.requestId);
      reject(createBridgeError("TIMEOUT", "Timed out waiting for browser bridge response."));
    }, timeoutMs);

    session.pendingRequests.set(input.request.requestId, {
      requestType: input.request.type,
      timeoutId,
      resolve,
      reject
    });

    try {
      const activeStream = session.browserStream;
      if (!activeStream) {
        throw createBridgeError("NO_BROWSER", "No browser client is connected to this bridge session.");
      }

      sendSseData(activeStream.controller, input.request);
    } catch (error) {
      clearTimeout(timeoutId);
      session.pendingRequests.delete(input.request.requestId);

      if (error instanceof BridgeBrokerError) {
        reject(error);
        return;
      }

      reject(
        createBridgeError(
          "NO_BROWSER",
          "Browser stream is unavailable while dispatching a bridge request."
        )
      );
    }
  });
}

function validateResponseType(requestType: BridgeRequest["type"], responseType: BridgeResponse["type"]): void {
  if (requestType === "snapshot_request" && responseType !== "snapshot_response") {
    throw createBridgeError(
      "INVALID_RESPONSE",
      `Expected snapshot_response, but received ${responseType}.`
    );
  }

  if (requestType === "execute_request" && responseType !== "execute_response") {
    throw createBridgeError(
      "INVALID_RESPONSE",
      `Expected execute_response, but received ${responseType}.`
    );
  }
}

export function resolveBridgeResponse(input: {
  sessionId: string;
  token: string;
  response: BridgeResponse;
}): void {
  const session = getAuthorizedSession(input.sessionId, input.token);

  const pending = session.pendingRequests.get(input.response.requestId);
  if (!pending) {
    throw createBridgeError("NOT_FOUND", `Pending request was not found: ${input.response.requestId}`);
  }

  session.pendingRequests.delete(input.response.requestId);
  clearTimeout(pending.timeoutId);

  if (input.response.type === "error_response") {
    pending.reject(createBridgeError("INVALID_RESPONSE", input.response.message));
    return;
  }

  try {
    validateResponseType(pending.requestType, input.response.type);
    pending.resolve(input.response);
  } catch (error) {
    if (error instanceof BridgeBrokerError) {
      pending.reject(error);
      throw error;
    }

    const bridgeError = createBridgeError("INVALID_RESPONSE", "Unexpected bridge response type.");
    pending.reject(bridgeError);
    throw bridgeError;
  }
}

export function toBridgeError(error: unknown): BridgeBrokerError {
  if (error instanceof BridgeBrokerError) {
    return error;
  }

  const message = error instanceof Error ? error.message : "Unexpected bridge failure.";
  return createBridgeError("INTERNAL", message);
}
