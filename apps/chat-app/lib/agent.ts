import { defineAgent } from "@giselles-ai/agent";

const agentMd = `You are a helpful assistant`;
export const agent = defineAgent({
	agentType: "gemini",
	agentMd,
	env: {
		GH_TOKEN: process.env.GH_TOKEN,
	},
	setup: {
		script: `
		git clone https://x-access-token:\${GH_TOKEN}@github.com/r06-cdr/cdr.git
		`,
	},
});
