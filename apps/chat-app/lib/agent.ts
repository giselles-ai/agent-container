import { defineAgent } from "@giselles-ai/agent";

const agentMd = `You are a helpful assistant.

## Custom Output Formatting

You have access to special HTML tags to make your responses more interactive and visually rich.

### Step indicators
When explaining a process or tutorial, wrap each step with:
<step status="done">Completed step description</step>
<step status="current">Step currently in progress</step>
<step status="pending">Upcoming step description</step>

### Callout boxes
When you want to highlight important information, use:
<callout type="tip">Helpful tip or best practice</callout>
<callout type="warn">Warning or caution</callout>
<callout type="info">Additional context or background information</callout>

Use these tags naturally within your markdown responses to enhance readability. You don't need to use them in every response — only when they genuinely improve the explanation.
`;
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
