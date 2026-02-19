import { createBridgeHandler } from "@giselles-ai/sandbox-agent-core";
import { preflightResponse, withCors } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bridge = createBridgeHandler();

export async function OPTIONS(): Promise<Response> {
	return preflightResponse();
}

export async function GET(request: Request): Promise<Response> {
	const response = await bridge.GET(request);
	return withCors(response);
}

export async function POST(request: Request): Promise<Response> {
	const response = await bridge.POST(request);
	return withCors(response);
}
