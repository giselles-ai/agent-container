import { defineAgent } from "@giselles-ai/agent";

const agentMd = `You are a helpful assistant`;
export const agent = defineAgent({
	agentType: "gemini",
	agentMd,
});
