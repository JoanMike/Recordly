import fs from "node:fs/promises";
import { Notification } from "electron";
import { RECORDINGS_SETTINGS_FILE } from "../constants";
import { parseJsonWithByteOrderMark } from "../utils";

export interface AutoStopSettings {
	/** 0 disables the limit. */
	autoStopMinutes: number;
	/** Warn when the recordings drive has less than this many GB free. */
	lowDiskWarnGb: number;
}

const DEFAULT_SETTINGS: AutoStopSettings = { autoStopMinutes: 0, lowDiskWarnGb: 2 };
const CHECK_INTERVAL_MS = 15_000;

export async function readAutoStopSettings(): Promise<AutoStopSettings> {
	try {
		const content = await fs.readFile(RECORDINGS_SETTINGS_FILE, "utf-8");
		const parsed = parseJsonWithByteOrderMark<Partial<AutoStopSettings>>(content);
		return {
			autoStopMinutes:
				typeof parsed.autoStopMinutes === "number" && parsed.autoStopMinutes > 0
					? Math.round(parsed.autoStopMinutes)
					: 0,
			lowDiskWarnGb:
				typeof parsed.lowDiskWarnGb === "number" && parsed.lowDiskWarnGb > 0
					? parsed.lowDiskWarnGb
					: DEFAULT_SETTINGS.lowDiskWarnGb,
		};
	} catch {
		return { ...DEFAULT_SETTINGS };
	}
}

export async function getFreeDiskGb(targetDir: string): Promise<number | null> {
	try {
		const stats = await fs.statfs(targetDir);
		return (stats.bavail * stats.bsize) / 1024 ** 3;
	} catch {
		return null;
	}
}

let watchTimer: NodeJS.Timeout | null = null;
let warnedThisRecording = false;

function notify(title: string, body: string) {
	try {
		new Notification({ title, body }).show();
	} catch {
		// Notifications are best-effort (focus assist, missing shell support).
	}
}

export async function stopAutoStopWatch(): Promise<void> {
	if (!watchTimer) return;
	clearInterval(watchTimer);
	watchTimer = null;
}

/**
 * Watches a running capture: stops it when the configured limit is reached and
 * warns when the recordings drive is running out of space.
 */
export async function startAutoStopWatch(options: {
	recordingsDir: string;
	onAutoStop: () => void;
}): Promise<void> {
	await stopAutoStopWatch();
	const settings = await readAutoStopSettings();
	if (settings.autoStopMinutes === 0 && settings.lowDiskWarnGb <= 0) return;

	const startedAt = Date.now();
	warnedThisRecording = false;

	const checkDisk = async () => {
		if (warnedThisRecording) return;
		const freeGb = await getFreeDiskGb(options.recordingsDir);
		if (freeGb === null || freeGb >= settings.lowDiskWarnGb) return;
		warnedThisRecording = true;
		notify(
			"Low disk space",
			`Only ${freeGb.toFixed(1)} GB left where recordings are saved. Stop the recording or free up space.`,
		);
	};

	await checkDisk();
	watchTimer = setInterval(() => {
		void checkDisk();
		if (
			settings.autoStopMinutes > 0 &&
			Date.now() - startedAt >= settings.autoStopMinutes * 60_000
		) {
			void stopAutoStopWatch();
			notify(
				"Recording stopped",
				`The ${settings.autoStopMinutes} minute recording limit was reached.`,
			);
			options.onAutoStop();
		}
	}, CHECK_INTERVAL_MS);
	watchTimer.unref?.();
}
