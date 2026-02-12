import { createBridgeRoutes } from "@giselles/rpa-bridge/next";

export const runtime = "nodejs";

const handler = createBridgeRoutes();

export const GET = handler.GET;
export const POST = handler.POST;
