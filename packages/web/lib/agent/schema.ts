import { z } from "zod";

export const agentConfigSchema = z.object({
	name: z.string().min(1),
	slug: z
		.string()
		.min(1)
		.regex(/^[a-z0-9-]+$/),
	runtime: z.string().optional(),
	env: z.array(z.string()).default([]),
	description: z.string().optional(),
});

export type AgentConfig = z.infer<typeof agentConfigSchema>;

export const agentManifestSchema = agentConfigSchema.extend({
	bundlePath: z.string().min(1),
	createdAt: z.string().min(1),
	version: z.string().min(1),
});

export type AgentManifest = z.infer<typeof agentManifestSchema>;
