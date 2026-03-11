import { defineAgent } from "@giselles-ai/agent";

const agentMd = `You are a helpful assistant`;
export const agent = defineAgent({
	agentType: "gemini",
	agentMd,
	env: {
		hello: "world",
		GITHUB_AUTH_TOKEN: "gpt-xxxx",
	},
});
