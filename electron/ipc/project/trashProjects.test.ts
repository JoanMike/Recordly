import path from "node:path";
import { expect, it, vi } from "vitest";
import { trashLibraryProjects } from "./trashProjects";

// `path.resolve` keeps these fixtures in the same coordinate space the library
// uses for its membership check, so the test also runs on Windows (where
// "/private/tmp/a.recordly" resolves to "<drive>:\\private\\tmp\\a.recordly").
const ROOT = path.resolve("/private/tmp");
const PROJECT_A = path.join(ROOT, "a.recordly");
const PROJECT_B = path.join(ROOT, "b.recordly");
const PRIVATE_FILE = path.join(ROOT, "private.txt");

it("rejects paths outside the project library before touching files", async () => {
	const trash = vi.fn();
	await expect(
		trashLibraryProjects([PROJECT_A, PRIVATE_FILE], {
			list: async () => ({ entries: [{ path: PROJECT_A }] }),
			trash,
			thumbnailPath: (p) => p + ".png",
		}),
	).rejects.toThrow("not in the library");
	expect(trash).not.toHaveBeenCalled();
});
it("trashes only selected project files, deduplicates paths, and reports partial failures", async () => {
	const trash = vi.fn(async (p: string) => {
		if (p.endsWith("b.recordly")) throw Error("locked");
	});
	const result = await trashLibraryProjects([PROJECT_A, PROJECT_A, PROJECT_B], {
		list: async () => ({
			entries: [{ path: PROJECT_A }, { path: PROJECT_B }],
		}),
		trash,
		thumbnailPath: (p) => p + ".missing.png",
	});
	expect(result.deleted).toEqual([PROJECT_A]);
	expect(result.errors).toEqual(["Could not trash b.recordly"]);
	expect(trash.mock.calls.map(([p]) => p)).toEqual([PROJECT_A, PROJECT_B]);
});
