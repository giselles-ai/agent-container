"use client";

import { useContext } from "react";
import { RpaContext } from "./provider";

export function useRpa() {
	const context = useContext(RpaContext);
	if (!context) {
		throw new Error("useRpa must be used inside <RpaProvider />.");
	}
	return context;
}
