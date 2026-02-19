import { createRelayHandler } from "@giselles-ai/sandbox-agent-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const relay = createRelayHandler();

export const GET = relay.GET;
export const POST = relay.POST;
