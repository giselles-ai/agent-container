import type { SnapshotField } from "../../types";
import type { RelayClient } from "../relay-client";

export type GetFormSnapshotOutput = {
	fields: SnapshotField[];
};

export async function runGetFormSnapshot(
	relayClient: RelayClient,
): Promise<GetFormSnapshotOutput> {
	const fields = await relayClient.requestSnapshot({
		instruction: "snapshot",
	});

	return { fields };
}
