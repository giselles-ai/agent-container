import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createBridgeClientFromEnv } from "./bridge-client";
import {
	executeFormActionsInputShape,
	runExecuteFormActions,
} from "./tools/execute-form-actions";
import { runGetFormSnapshot } from "./tools/get-form-snapshot";

const server = new McpServer(
	{
		name: "giselles-browser-tool-mcp-server",
		version: "0.2.0",
	},
	{
		instructions: [
			"You are a Browser Tool agent that fills web forms on behalf of the user.",
			"",
			"When the user asks you to fill a form or interact with a web page, follow these steps in order:",
			"",
			"1. Call `getFormSnapshot` (no arguments) to get the list of form fields currently visible in the browser.",
			"2. Based on the user's instruction and the returned fields, plan which actions to perform.",
			"   Each action must reference a `fieldId` from the snapshot. Allowed actions:",
			"   - `fill`: Set the value of a text/textarea field. Requires `fieldId` and `value`.",
			"   - `select`: Choose an option in a select/radio field. Requires `fieldId` and `value` (must be one of the field's `options`).",
			"   - `click`: Click a checkbox or button. Requires only `fieldId`.",
			"3. Call `executeFormActions` with the planned `actions` array and the `fields` array from step 1.",
			"",
			"Rules:",
			"- Always call `getFormSnapshot` first before planning any actions.",
			"- Only use `fieldId` values that appear in the snapshot response. Never invent field IDs.",
			"- If the user's instruction is ambiguous or no matching field exists, explain the issue instead of guessing.",
			"- Pass the `fields` array from the snapshot response unchanged to `executeFormActions`.",
		].join("\n"),
	},
);

server.registerTool("getFormSnapshot", {}, async () => {
	try {
		const bridgeClient = createBridgeClientFromEnv();
		const output = await runGetFormSnapshot(bridgeClient);

		return {
			content: [
				{
					type: "text",
					text: JSON.stringify(output),
				},
			],
			structuredContent: output,
		};
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to get form snapshot.";
		const stack = error instanceof Error ? error.stack : undefined;
		console.error(`[mcp getFormSnapshot] ${message}`);
		if (stack) {
			console.error(stack);
		}

		return {
			isError: true,
			content: [
				{
					type: "text",
					text: message,
				},
			],
		};
	}
});

server.registerTool(
	"executeFormActions",
	{ inputSchema: executeFormActionsInputShape },
	async (input) => {
		try {
			const bridgeClient = createBridgeClientFromEnv();
			const output = await runExecuteFormActions(input, bridgeClient);

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(output),
					},
				],
				structuredContent: output,
			};
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Failed to execute form actions.";
			const stack = error instanceof Error ? error.stack : undefined;
			console.error(`[mcp executeFormActions] ${message}`);
			if (stack) {
				console.error(stack);
			}

			return {
				isError: true,
				content: [
					{
						type: "text",
						text: message,
					},
				],
			};
		}
	},
);

const transport = new StdioServerTransport();
await server.connect(transport);
