import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createBridgeClientFromEnv } from "./bridge-client.js";
import { fillFormInputShape, runFillForm } from "./tools/fill-form.js";

const server = new McpServer({
	name: "giselles-rpa-mcp-server",
	version: "0.1.0",
});

server.tool("fillForm", fillFormInputShape, async (input) => {
	try {
		const bridgeClient = createBridgeClientFromEnv();
		const output = await runFillForm(input, bridgeClient);

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
			error instanceof Error ? error.message : "Failed to execute fillForm.";
		const stack = error instanceof Error ? error.stack : undefined;
		console.error(`[mcp fillForm] ${message}`);
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

const transport = new StdioServerTransport();
await server.connect(transport);
