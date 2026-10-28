import fs from "node:fs/promises";
import path from "node:path";
import { getRecordingsDir } from "../utils";

const RECORDING_EXTENSIONS = /\.(mp4|mov|webm|mkv|m4v)$/i;
const SIDECAR_SUFFIXES = [
	".system.wav",
	".system.wav.json",
	".mic.wav",
	".cursor.json",
	".recording-diagnostics.json",
	".recordly-session.json",
];

export interface RecordingsStorageUsage {
	directory: string;
	bytes: number;
	recordings: number;
}

async function statSafe(filePath: string) {
	try {
		return await fs.stat(filePath);
	} catch {
		return null;
	}
}

export async function getRecordingsStorageUsage(): Promise<RecordingsStorageUsage> {
	const directory = await getRecordingsDir();
	let entries;
	try {
		entries = await fs.readdir(directory, { withFileTypes: true });
	} catch {
		return { directory, bytes: 0, recordings: 0 };
	}
	let bytes = 0;
	let recordings = 0;
	for (const entry of entries) {
		if (!entry.isFile()) continue;
		const stat = await statSafe(path.join(directory, entry.name));
		if (!stat) continue;
		bytes += stat.size;
		if (RECORDING_EXTENSIONS.test(entry.name) && !/[.-]webcam[.-]/i.test(entry.name)) {
			recordings += 1;
		}
	}
	return { directory, bytes, recordings };
}

/**
 * Deletes whole recording bundles (video + its sidecars) older than the given
 * number of days. Files touched in the last hour are skipped so a recording
 * that is still being finalized never disappears.
 */
export async function purgeRecordingsOlderThan(days: number): Promise<{
	removed: number;
	freedBytes: number;
	directory: string;
}> {
	const directory = await getRecordingsDir();
	if (!Number.isFinite(days) || days <= 0) {
		return { removed: 0, freedBytes: 0, directory };
	}
	const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
	const guard = Date.now() - 60 * 60 * 1000;
	let entries;
	try {
		entries = await fs.readdir(directory, { withFileTypes: true });
	} catch {
		return { removed: 0, freedBytes: 0, directory };
	}

	let removed = 0;
	let freedBytes = 0;
	for (const entry of entries) {
		if (!entry.isFile() || !RECORDING_EXTENSIONS.test(entry.name)) continue;
		const videoPath = path.join(directory, entry.name);
		const stat = await statSafe(videoPath);
		if (!stat || stat.mtimeMs > cutoff || stat.mtimeMs > guard) continue;

		const base = videoPath.slice(0, -path.extname(videoPath).length);
		const bundle = [videoPath, ...SIDECAR_SUFFIXES.map((suffix) => `${base}${suffix}`)];
		const webcam = `${base}-webcam.mp4`;
		bundle.push(webcam);

		try {
			for (const file of bundle) {
				const fileStat = await statSafe(file);
				if (!fileStat) continue;
				if (fileStat.mtimeMs > guard) continue;
				await fs.rm(file, { force: true });
				freedBytes += fileStat.size;
			}
			removed += 1;
		} catch {
			// A locked file just stays for the next purge.
		}
	}
	return { removed, freedBytes, directory };
}
