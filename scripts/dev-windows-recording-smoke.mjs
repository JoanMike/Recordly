/**
 * End-to-end smoke test for native Windows recording without clicking the UI.
 *
 * Launches the built Electron app (run `npm run build` or `npx vite build`
 * first), drives the renderer IPC directly, records a window for a few seconds
 * and prints the resulting video + cursor telemetry paths.
 *
 * Usage:
 *   TARGET_WINDOW_REGEX="notepad" PARK_CURSOR_AT="600,400" node scripts/dev-windows-recording-smoke.mjs
 *
 * `PARK_CURSOR_AT` moves the real pointer to that screen position shortly after
 * capture starts, so the telemetry samples can be checked against the window
 * rect (a pointer parked at the centre of the recorded window must normalise to
 * 0.5/0.5).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import { _electron as electron } from "@playwright/test";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function log(...args) {
	console.log("[recording-smoke]", ...args);
}

const app = await electron.launch({ args: ["."], cwd: process.cwd() });
try {
	const page = await app.firstWindow();
	await page.waitForLoadState("domcontentloaded");
	await page.waitForFunction(() => Boolean(window.electronAPI), null, { timeout: 60000 });
	await sleep(2500);
	log("renderer ready:", await page.evaluate(() => (window.electronAPI ? "yes" : "no")));

	const sources = await page.evaluate(async () => {
		const list = await window.electronAPI.getSources({
			types: ["window", "screen"],
			thumbnailSize: { width: 320, height: 180 },
			fetchWindowIcons: false,
		});
		return list.map((source) => ({
			id: source.id,
			name: source.name,
			sourceType: source.sourceType,
			display_id: source.display_id,
		}));
	});
	log("sources:", JSON.stringify(sources));

	const targetPattern = new RegExp(process.env.TARGET_WINDOW_REGEX ?? "notepad", "i");
	const target = sources.find(
		(source) => source.sourceType === "window" && targetPattern.test(source.name),
	);

	if (!target) {
		log("no matching window source found");
		process.exitCode = 2;
	} else {
		log("target:", JSON.stringify(target));

		await page.evaluate(async (source) => {
			await window.electronAPI.selectSource(source);
		}, target);

		const captureSystemAudio = process.env.CAPTURE_SYSTEM_AUDIO === "1";
		const start = await page.evaluate(
			async ({ source, captureSystemAudio }) =>
				window.electronAPI.startNativeScreenRecording(source, {
					capturesSystemAudio: captureSystemAudio,
					capturesMicrophone: false,
				}),
			{ source: target, captureSystemAudio },
		);
		log("start:", JSON.stringify(start));
		await page.evaluate(async () => {
			await window.electronAPI.setRecordingState(true);
		});

		if (process.env.PARK_CURSOR_AT) {
			const [parkX, parkY] = process.env.PARK_CURSOR_AT.split(",").map(Number);
			await sleep(700);
			execFileSync("powershell.exe", [
				"-NoProfile",
				"-Command",
				`Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class P { [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y); }'; [P]::SetCursorPos(${parkX}, ${parkY}) | Out-Null`,
			]);
			log("cursor parked at", parkX, parkY);
		}

		await sleep(2500);

		const stop = await page.evaluate(async () =>
			window.electronAPI.stopNativeScreenRecording(),
		);
		log("stop:", JSON.stringify(stop));
		await page.evaluate(async () => {
			await window.electronAPI.setRecordingState(false);
		});
		await sleep(1500);

		const diagnostics = await page.evaluate(async () =>
			window.electronAPI.getLastNativeCaptureDiagnostics?.(),
		);
		log("diagnostics:", JSON.stringify(diagnostics));
		if (stop?.path) {
			const stat = await fs.stat(stop.path).catch(() => null);
			log("recording file:", stop.path, stat ? `${stat.size} bytes` : "MISSING");
			const telemetryPath = `${stop.path}.cursor.json`;
			const telemetry = await fs.readFile(telemetryPath, "utf8").catch(() => null);
			log("telemetry:", telemetry ? `${telemetry.length} bytes` : "MISSING", telemetryPath);
		}
	}
} finally {
	await app.close().catch(() => {});
}
