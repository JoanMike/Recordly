import fs from "node:fs/promises";
import path from "node:path";

/**
 * Native Windows recordings are written to `recordly-native-<timestamp>.*` in the
 * OS temp folder and moved to the recordings folder when the stop handler runs.
 * A crash or a killed process leaves those files behind, and nothing ever looks
 * at them again (issue #1053).
 */
export const ORPHAN_RECORDING_TEMP_PREFIX = "recordly-native-";

export async function cleanupOrphanRecordingTempFiles(
	tempDir: string,
	options: { minAgeMs?: number; now?: number } = {},
): Promise<string[]> {
	const minAgeMs = options.minAgeMs ?? 0;
	const now = options.now ?? Date.now();
	let entries;
	try {
		entries = await fs.readdir(tempDir, { withFileTypes: true });
	} catch {
		return [];
	}

	const removed: string[] = [];
	for (const entry of entries) {
		if (!entry.isFile() || !entry.name.startsWith(ORPHAN_RECORDING_TEMP_PREFIX)) {
			continue;
		}
		const filePath = path.join(tempDir, entry.name);
		try {
			const stat = await fs.stat(filePath);
			if (now - stat.mtimeMs < minAgeMs) {
				continue;
			}
			await fs.rm(filePath, { force: true });
			removed.push(filePath);
		} catch {
			// A file that vanished (or is locked by a dying helper) is not our problem.
		}
	}
	return removed;
}
