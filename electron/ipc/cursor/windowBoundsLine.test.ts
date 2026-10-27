import { describe, expect, it } from "vitest";
import { parseWindowBoundsLine } from "./windowBoundsLine";

describe("parseWindowBoundsLine", () => {
	it("parses DWM bounds reported by the native cursor monitor", () => {
		expect(parseWindowBoundsLine("WINDOW:120,64,800,600")).toEqual({
			kind: "bounds",
			bounds: { x: 120, y: 64, width: 800, height: 600 },
		});
	});

	it("keeps negative origins for windows on left/top monitors", () => {
		expect(parseWindowBoundsLine("WINDOW:-1920,0,1920,1080")).toEqual({
			kind: "bounds",
			bounds: { x: -1920, y: 0, width: 1920, height: 1080 },
		});
	});

	it("reports a missing window", () => {
		expect(parseWindowBoundsLine("WINDOW:none")).toEqual({ kind: "missing" });
	});

	it("treats degenerate sizes as a missing window", () => {
		expect(parseWindowBoundsLine("WINDOW:0,0,0,600")).toEqual({ kind: "missing" });
	});

	it("ignores unrelated helper output", () => {
		expect(parseWindowBoundsLine("STATE:arrow")).toBeNull();
		expect(parseWindowBoundsLine("INTERACTION:mousedown:1")).toBeNull();
		expect(parseWindowBoundsLine("WINDOW:1,2,3")).toBeNull();
	});
});
