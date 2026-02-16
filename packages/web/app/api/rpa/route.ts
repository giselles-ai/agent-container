import {
	planActions,
	planActionsInputSchema,
} from "@giselles/browser-tool-planner";

export async function POST(request: Request) {
	const payload = await request.json().catch(() => null);
	const parsed = planActionsInputSchema.safeParse(payload);

	if (!parsed.success) {
		return Response.json(
			{
				actions: [],
				warnings: ["Invalid request payload."],
				error: parsed.error.flatten(),
			},
			{ status: 400 },
		);
	}

	try {
		const result = await planActions(parsed.data);
		return Response.json(result);
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown LLM error.";

		return Response.json(
			{
				actions: [],
				warnings: [`Failed to generate actions: ${message}`],
			},
			{ status: 500 },
		);
	}
}
