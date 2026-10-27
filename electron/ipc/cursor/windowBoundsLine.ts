import type { WindowBounds } from "../types";

export type WindowBoundsLine = { kind: "missing" } | { kind: "bounds"; bounds: WindowBounds };

/**
 * Parses the `WINDOW:` lines emitted by the native cursor monitor.
 *
 * The helper reports DWM extended frame bounds in physical pixels, the same
 * rect the WGC capture helper crops to; callers convert them to DIP before
 * normalising cursor samples.
 */
export function parseWindowBoundsLine(line: string): WindowBoundsLine | null {
	const match = line.match(/^WINDOW:(none|(-?\d+),(-?\d+),(\d+),(\d+))$/);
	if (!match) {
		return null;
	}

	if (match[1] === "none") {
		return { kind: "missing" };
	}

	const bounds: WindowBounds = {
		x: Number(match[2]),
		y: Number(match[3]),
		width: Number(match[4]),
		height: Number(match[5]),
	};

	if (
		!Number.isFinite(bounds.x) ||
		!Number.isFinite(bounds.y) ||
		!Number.isFinite(bounds.width) ||
		!Number.isFinite(bounds.height) ||
		bounds.width <= 0 ||
		bounds.height <= 0
	) {
		return { kind: "missing" };
	}

	return { kind: "bounds", bounds };
}
