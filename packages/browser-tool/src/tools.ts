import { tool } from "ai";
import { z } from "zod";
import {
	browserToolActionSchema,
	executionReportSchema,
	snapshotFieldSchema,
} from "./types";

export type BrowserTools = typeof browserTools;

export const browserTools = {
	getFormSnapshot: tool({
		description: "Capture the current state of form fields on the page.",
		inputSchema: z.object({
			instruction: z
				.string()
				.describe("What to look for in the current form state."),
			document: z
				.string()
				.optional()
				.describe("Additional context to guide the snapshot."),
		}),
		outputSchema: z.object({
			fields: z.array(snapshotFieldSchema),
		}),
	}),
	executeFormActions: tool({
		description: "Execute fill, click, and select actions on form fields.",
		inputSchema: z.object({
			actions: z.array(browserToolActionSchema),
			fields: z.array(snapshotFieldSchema),
		}),
		outputSchema: z.object({
			report: executionReportSchema,
		}),
	}),
} as const;
