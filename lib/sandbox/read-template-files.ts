import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

export type SandboxFile = {
	path: string;
	content: Buffer;
};

export async function readTemplateFiles(
	templateDirPath: string,
): Promise<SandboxFile[]> {
	const templateDir = join(process.cwd(), templateDirPath);
	const entries = await readdir(templateDir, {
		withFileTypes: true,
		recursive: true,
	});

	const fileEntries = entries.filter((entry) => entry.isFile());

	const files = await Promise.all(
		fileEntries.map(async (entry) => {
			const absolutePath = join(entry.parentPath, entry.name);
			const relativePath = relative(templateDir, absolutePath);
			const content = await readFile(absolutePath);
			return { path: relativePath, content };
		}),
	);

	return files;
}
