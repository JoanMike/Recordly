import fs from "node:fs/promises";
import path from "node:path";
import { USER_DATA_PATH } from "./appPaths";
import { parseJsonWithByteOrderMark } from "./ipc/utils";

export interface TeleprompterSettings {
	text: string;
	/** Scroll speed in pixels per second. */
	speed: number;
	/** Font size in pixels. */
	fontSize: number;
}

export const DEFAULT_TELEPROMPTER_SETTINGS: TeleprompterSettings = {
	text: "",
	speed: 60,
	fontSize: 44,
};

const SETTINGS_FILE = path.join(USER_DATA_PATH, "teleprompter.json");

const clampNumber = (value: unknown, min: number, max: number, fallback: number) =>
	typeof value === "number" && Number.isFinite(value)
		? Math.min(max, Math.max(min, Math.round(value)))
		: fallback;

export async function readTeleprompterSettings(): Promise<TeleprompterSettings> {
	try {
		const content = await fs.readFile(SETTINGS_FILE, "utf-8");
		const parsed = parseJsonWithByteOrderMark<Partial<TeleprompterSettings>>(content);
		return {
			text: typeof parsed.text === "string" ? parsed.text : "",
			speed: clampNumber(parsed.speed, 10, 300, DEFAULT_TELEPROMPTER_SETTINGS.speed),
			fontSize: clampNumber(parsed.fontSize, 16, 120, DEFAULT_TELEPROMPTER_SETTINGS.fontSize),
		};
	} catch {
		return { ...DEFAULT_TELEPROMPTER_SETTINGS };
	}
}

export async function writeTeleprompterSettings(
	patch: Partial<TeleprompterSettings>,
): Promise<TeleprompterSettings> {
	const current = await readTeleprompterSettings();
	const next: TeleprompterSettings = {
		text: typeof patch.text === "string" ? patch.text : current.text,
		speed: clampNumber(patch.speed, 10, 300, current.speed),
		fontSize: clampNumber(patch.fontSize, 16, 120, current.fontSize),
	};
	await fs.mkdir(path.dirname(SETTINGS_FILE), { recursive: true });
	await fs.writeFile(SETTINGS_FILE, JSON.stringify(next, null, 2), "utf-8");
	return next;
}
