import { JsonToSseTransformStream, ToolLoopAgent } from "ai";
import { weatherTool } from "./tools";

const agent = new ToolLoopAgent({
	model: "openai/gpt-5",
	instructions: "You are a helpful assistant.",
	tools: {
		weather: weatherTool,
	},
});

async function main() {
	const stream = await agent.stream({
		prompt: "What is the weather in NYC?",
	});

	const uiStream = stream.toUIMessageStream();
	const sseStream = uiStream
		.pipeThrough(new JsonToSseTransformStream())
		.pipeThrough(new TextEncoderStream());

	const reader = sseStream.getReader();
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		process.stdout.write(Buffer.from(value));
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
