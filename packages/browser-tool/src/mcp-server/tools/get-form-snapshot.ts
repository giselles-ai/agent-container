import type { SnapshotField } from "../../types";
import type { BridgeClient } from "../bridge-client";

export type GetFormSnapshotOutput = {
	fields: SnapshotField[];
};

export async function runGetFormSnapshot(
	bridgeClient: BridgeClient,
): Promise<GetFormSnapshotOutput> {
	const fields = await bridgeClient.requestSnapshot({
		instruction: "snapshot",
	});

	return { fields };
}
