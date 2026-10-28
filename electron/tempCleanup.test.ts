import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanupOrphanRecordingTempFiles } from "./tempCleanup";

describe("cleanupOrphanRecordingTempFiles", () => {
	let dir: string;

	beforeEach(async () => {
		dir = await fs.mkdtemp(path.join(os.tmpdir(), "recordly-temp-cleanup-"));
	});

	afterEach(async () => {
		await fs.rm(dir, { recursive: true, force: true });
	});

	it("removes only the native recording leftovers", async () => {
		await fs.writeFile(path.join(dir, "recordly-native-1000.mp4"), "video");
		await fs.writeFile(path.join(dir, "recordly-native-1000.system.wav"), "audio");
		await fs.writeFile(path.join(dir, "unrelated.txt"), "keep me");
		await fs.mkdir(path.join(dir, "recordly-native-1000.dir"));

		const removed = await cleanupOrphanRecordingTempFiles(dir);

		expect(removed).toHaveLength(2);
		const left = await fs.readdir(dir);
		expect(left.sort()).toEqual(["recordly-native-1000.dir", "unrelated.txt"]);
	});

	it("keeps files that are newer than the minimum age", async () => {
		const oldFile = path.join(dir, "recordly-native-old.mp4");
		const freshFile = path.join(dir, "recordly-native-fresh.mp4");
		await fs.writeFile(oldFile, "old");
		await fs.writeFile(freshFile, "fresh");
		const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
		await fs.utimes(oldFile, twoHoursAgo, twoHoursAgo);

		const removed = await cleanupOrphanRecordingTempFiles(dir, {
			minAgeMs: 60 * 60 * 1000,
		});

		expect(removed).toEqual([oldFile]);
		expect(await fs.readdir(dir)).toEqual(["recordly-native-fresh.mp4"]);
	});

	it("returns an empty list when the temp folder is missing", async () => {
		await expect(
			cleanupOrphanRecordingTempFiles(path.join(dir, "does-not-exist")),
		).resolves.toEqual([]);
	});
});
