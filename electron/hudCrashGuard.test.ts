import { afterEach, describe, expect, it, vi } from "vitest";
import {
	getHudCrashStopHandler,
	handleHudRendererCrash,
	registerHudCrashStopHandler,
} from "./hudCrashGuard";

describe("hudCrashGuard", () => {
	afterEach(() => {
		// Module state is global: leave it empty for the next suite.
		registerHudCrashStopHandler(async () => undefined);
	});

	it("stops the recording through the registered handler", async () => {
		const stop = vi.fn(async () => ({ success: true, videoPath: "C:/rec.mp4" }));
		registerHudCrashStopHandler(stop);

		const result = await handleHudRendererCrash("crashed");

		expect(stop).toHaveBeenCalledTimes(1);
		expect(result).toEqual({ success: true, videoPath: "C:/rec.mp4" });
	});

	it("swallows errors from the stop handler so the main process stays alive", async () => {
		registerHudCrashStopHandler(async () => {
			throw new Error("boom");
		});

		await expect(handleHudRendererCrash("oom")).resolves.toBeNull();
	});

	it("exposes the registered handler", () => {
		const stop = async () => null;
		registerHudCrashStopHandler(stop);
		expect(getHudCrashStopHandler()).toBe(stop);
	});
});
