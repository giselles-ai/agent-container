import { createBridgeRoutes } from "@giselles/browser-tool-bridge/next";

export const runtime = "nodejs";

const handler = createBridgeRoutes();

export const GET = handler.GET;
export const POST = handler.POST;
