const cache = new Map<string, string>();

export function getCachedSnapshotId(configHash: string): string | undefined {
	return cache.get(configHash);
}

export function setCachedSnapshotId(
	configHash: string,
	snapshotId: string,
): void {
	cache.set(configHash, snapshotId);
}
