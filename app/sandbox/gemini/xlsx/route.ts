import { readFile } from "node:fs/promises";
import { Sandbox } from "@vercel/sandbox";
import { NextResponse } from "next/server";

export async function GET() {
	const xlsxFileUrl = new URL(
		"./Location-Language-Codes-GoogleAds.xlsx",
		import.meta.url,
	);
	const xlsxFile = await readFile(xlsxFileUrl);
	const sandbox = await Sandbox.create({ runtime: "node24" });
	await sandbox.runCommand("npm", ["install", "-g", "@google/gemini-cli"]);
	await sandbox.runCommand("npx", [
		"--skills",
		"add",
		"https://github.com/anthropics/skills",
		"--skill",
		"xlsx",
	]);
	await sandbox.writeFiles([{ path: "upload.xlsx", content: xlsxFile }]);
	const result = await sandbox.runCommand("gemini", [
		"upload.xlsx について 〜 して 〜 して 〜 を出力して",
	]);
	const output = await result.output();
	return NextResponse.json({ output });
}
