import { handleAgentRunner } from "@giselles-ai/agent";

export const runtime = "nodejs";

const handler = handleAgentRunner({ tools: { browser: true } });

export const GET = handler.GET;
export const POST = handler.POST;
