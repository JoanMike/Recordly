import fs from "node:fs/promises";
import path from "node:path";
import { globalShortcut } from "electron";
import { USER_DATA_PATH } from "./appPaths";
import { getHudOverlayWindow } from "./windows";
import { parseJsonWithByteOrderMark } from "./ipc/utils";

export interface GlobalShortcutSettings {
	enabled: boolean;
	/** Electron accelerator, e.g. "Control+Alt+R". */
	toggleRecording: string;
	pauseRecording: string;
}

export const DEFAULT_GLOBAL_SHORTCUTS: GlobalShortcutSettings = {
	enabled: false,
	toggleRecording: "Control+Alt+R",
	pauseRecording: "Control+Alt+P",
};

const SETTINGS_FILE = path.join(USER_DATA_PATH, "global-shortcuts.json");

export async function readGlobalShortcutSettings(): Promise<GlobalShortcutSettings> {
	try {
		const content = await fs.readFile(SETTINGS_FILE, "utf-8");
		const parsed = parseJsonWithByteOrderMark<Partial<GlobalShortcutSettings>>(content);
		return {
			enabled: parsed.enabled === true,
			toggleRecording:
				typeof parsed.toggleRecording === "string" && parsed.toggleRecording.trim()
					? parsed.toggleRecording
					: DEFAULT_GLOBAL_SHORTCUTS.toggleRecording,
			pauseRecording:
				typeof parsed.pauseRecording === "string" && parsed.pauseRecording.trim()
					? parsed.pauseRecording
					: DEFAULT_GLOBAL_SHORTCUTS.pauseRecording,
		};
	} catch {
		return { ...DEFAULT_GLOBAL_SHORTCUTS };
	}
}

export async function writeGlobalShortcutSettings(
	patch: Partial<GlobalShortcutSettings>,
): Promise<GlobalShortcutSettings> {
	const current = await readGlobalShortcutSettings();
	const next: GlobalShortcutSettings = {
		enabled: patch.enabled ?? current.enabled,
		toggleRecording: patch.toggleRecording?.trim() || current.toggleRecording,
		pauseRecording: patch.pauseRecording?.trim() || current.pauseRecording,
	};
	await fs.mkdir(path.dirname(SETTINGS_FILE), { recursive: true });
	await fs.writeFile(SETTINGS_FILE, JSON.stringify(next, null, 2), "utf-8");
	return next;
}

function sendToHud(action: "toggle-recording" | "pause-resume") {
	const hud = getHudOverlayWindow();
	if (!hud || hud.isDestroyed()) return;
	hud.webContents.send("hud-global-shortcut", action);
}

/**
 * (Re)registers the global accelerators. Returns the ones the OS refused, which
 * usually means another app already owns that combination.
 */
export function applyGlobalShortcuts(settings: GlobalShortcutSettings): string[] {
	globalShortcut.unregisterAll();
	if (!settings.enabled) return [];
	const failed: string[] = [];
	if (!globalShortcut.register(settings.toggleRecording, () => sendToHud("toggle-recording"))) {
		failed.push(settings.toggleRecording);
	}
	if (settings.pauseRecording && settings.pauseRecording !== settings.toggleRecording) {
		if (!globalShortcut.register(settings.pauseRecording, () => sendToHud("pause-resume"))) {
			failed.push(settings.pauseRecording);
		}
	}
	return failed;
}

export function unregisterGlobalShortcuts() {
	globalShortcut.unregisterAll();
}
