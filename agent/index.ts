import fs from "node:fs/promises";
import path from "node:path";
import { JsonToSseTransformStream, ToolLoopAgent } from "ai";
import {
	createBashTool,
	experimental_createSkillTool as createSkillTool,
} from "bash-tool";

async function main() {
	// Discover skills and get files to upload
	const { skill, skills, files, instructions } = await createSkillTool({
		skillsDirectory: path.join(import.meta.dirname, "skills"),
	});

	console.log("Available skills:");
	for (const skill of skills) {
		console.log(`  - ${skill.name}: ${skill.description}`);
	}
	console.log("");

	// Create bash tool with skill files
	const { tools } = await createBashTool({
		files,
		extraInstructions: instructions,
	});

	// Create the agent with skills
	const agent = new ToolLoopAgent({
		model: "openai/gpt-5",
		tools: {
			skill,
			bash: tools.bash,
		},
		instructions: `You are a helpful assistant with access to skills.
  Use the skill tool to discover how to use a skill, then use bash to run its scripts.
  Skills are located at ./skills/<skill-name>/.`,
		onStepFinish: ({ toolCalls, toolResults }) => {
			if (toolCalls && toolCalls.length > 0) {
				for (const call of toolCalls) {
					console.log(`Tool: ${call.toolName}`);
					if (call.toolName === "skill" && "input" in call) {
						const input = call.input as { skillName: string };
						console.log(`  Loading skill: ${input.skillName}`);
					} else if (call.toolName === "bash" && "input" in call) {
						const input = call.input as { command: string };
						console.log(`  Command: ${input.command}`);
					}
				}
			}
			if (toolResults && toolResults.length > 0) {
				for (const result of toolResults) {
					if (result.toolName === "bash" && "output" in result) {
						const output = result.output as {
							stdout: string;
							exitCode: number;
						};
						if (output.stdout) {
							console.log(`  Output:\n${output.stdout.slice(0, 500)}`);
						}
					}
				}
				console.log("");
			}
		},
	});

	// Example prompt - the AI will discover and use skills as needed
	const prompt = `
      ampcodeを使うためのCDRを作成したいです
    `;

	console.log("Sending prompt to agent...\n");

	const stream = await agent.stream({ prompt });

	const uiStream = stream.toUIMessageStream({
		onFinish: async ({ messages, responseMessage }) => {
			const usage = await stream.totalUsage;
			const steps = await stream.steps;
			const text = await stream.text;
			console.log("\n=== Final Response ===\n");
			console.log(text);

			console.log("\n=== Agent Stats ===");
			console.log(`Steps: ${steps.length}`);
			console.log(`Usage: ${usage}`);

			const allMessages = [...messages, responseMessage];
			await fs.writeFile(
				path.join(import.meta.dirname, "messages.json"),
				JSON.stringify(allMessages, null, 2),
			);
			console.log("Messages saved to agent/messages.json");
		},
	});
	const sseStream = uiStream
		.pipeThrough(new JsonToSseTransformStream())
		.pipeThrough(new TextEncoderStream());

	const reader = sseStream.getReader();
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		process.stdout.write(Buffer.from(value));
		await new Promise((resolve) => setTimeout(resolve, 10000));
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
