import { after } from "next/server";
import { bot } from "@/lib/bot";

type Platform = keyof typeof bot.webhooks;

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ platform: string }> },
): Promise<Response> {
	const { platform } = await params;
	const handler = bot.webhooks[platform as Platform];

	if (!handler) {
		return new Response(`Unknown platform: ${platform}`, {
			status: 404,
		});
	}

	return handler(request, {
		waitUntil: (task) => after(() => task),
	});
}

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ platform: string }> },
): Promise<Response> {
	const { platform } = await params;
	const handler = bot.webhooks[platform as Platform];

	if (!handler) {
		return new Response(`Unknown platform: ${platform}`, {
			status: 404,
		});
	}

	return new Response(`${platform} webhook endpoint is active`, {
		status: 200,
	});
}
