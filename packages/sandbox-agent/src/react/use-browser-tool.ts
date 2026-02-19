"use client";

import { useContext } from "react";
import { BrowserToolContext } from "./provider";

export function useBrowserTool() {
	const context = useContext(BrowserToolContext);
	if (!context) {
		throw new Error(
			"useBrowserTool must be used inside <BrowserToolProvider />.",
		);
	}
	return context;
}
