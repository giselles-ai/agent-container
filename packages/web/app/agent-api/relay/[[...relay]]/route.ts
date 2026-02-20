import { createRelayHandler } from "@giselles-ai/browser-tool/relay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const relay = createRelayHandler();

export const GET = relay.GET;
export const POST = relay.POST;
