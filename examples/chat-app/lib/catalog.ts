import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";

export const chartSeriesSchema = z.object({
	name: z.string(),
	values: z.array(z.number()),
});

export const barChartResolvedPropsSchema = z.object({
	title: z.string().nullable().default(null),
	labels: z.array(z.string()).default([]),
	series: z.array(chartSeriesSchema).default([]),
});

export const lineChartResolvedPropsSchema = z.object({
	title: z.string().nullable().default(null),
	labels: z.array(z.string()).default([]),
	series: z.array(chartSeriesSchema).default([]),
});

export const pieChartResolvedPropsSchema = z.object({
	title: z.string().nullable().default(null),
	labels: z.array(z.string()).default([]),
	values: z.array(z.number()).default([]),
});

const barChartPropsSchema = z.object({
	title: z.string().nullable(),
	labels: z.array(z.string()),
	series: z.array(chartSeriesSchema),
});

const lineChartPropsSchema = z.object({
	title: z.string().nullable(),
	labels: z.array(z.string()),
	series: z.array(chartSeriesSchema),
});

const pieChartPropsSchema = z.object({
	title: z.string().nullable(),
	labels: z.array(z.string()),
	values: z.array(z.number()),
});

export const catalog = defineCatalog(schema, {
	components: {
		BarChart: {
			props: barChartPropsSchema,
			description:
				"Vertical bar chart. Use for comparing values across categories.",
		},
		LineChart: {
			props: lineChartPropsSchema,
			description:
				"Line chart with data points. Use for showing trends over time.",
		},
		PieChart: {
			props: pieChartPropsSchema,
			description:
				"Pie chart showing proportions. Use for part-of-whole comparisons.",
		},
		StepIndicator: {
			props: z.object({
				label: z.string(),
				status: z.enum(["done", "current", "pending"]),
			}),
			description:
				"Step indicator showing progress. Use when explaining processes or tutorials.",
		},
		Callout: {
			props: z.object({
				type: z.enum(["tip", "warn", "info"]),
				message: z.string(),
			}),
			description:
				"Callout box to highlight important information, tips, or warnings.",
		},
		Stack: {
			props: z.object({
				direction: z.enum(["vertical", "horizontal"]).nullable(),
				gap: z.enum(["sm", "md", "lg"]).nullable(),
			}),
			slots: ["default"],
			description: "Flex container for laying out child components.",
		},
	},
	actions: {},
});
