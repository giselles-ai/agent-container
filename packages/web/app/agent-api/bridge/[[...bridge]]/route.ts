import { createBridgeHandler } from "@giselles-ai/sandbox-agent-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bridge = createBridgeHandler();

export const GET = bridge.GET;
export const POST = bridge.POST;
