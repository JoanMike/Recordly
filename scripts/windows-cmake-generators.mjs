export const WINDOWS_CMAKE_GENERATORS = Object.freeze([
	{ name: "Visual Studio 18 2026", label: "VS 2026", toolset: "v143" },
	{ name: "Visual Studio 17 2022", label: "VS 2022", toolset: "v143" },
	{ name: "Visual Studio 16 2019", label: "VS 2019" },
]);

export const WINDOWS_VISUAL_STUDIO_INSTALL_DIRS = Object.freeze(["18", "2022", "2019"]);

/**
 * Ordered configure attempts for the Windows native helpers.
 *
 * Each generator is tried twice when it pins a toolset: once with that toolset
 * and once letting CMake pick the installed default. VS 2026 ships the v145
 * toolset and only installs v143 when the optional VS 2022 build tools are
 * selected, so pinning v143 made every native build fail with MSB8020 on a
 * clean VS 2026 machine.
 */
export function getWindowsCmakeGeneratorAttempts() {
	const attempts = [];

	for (const generator of WINDOWS_CMAKE_GENERATORS) {
		if (generator.toolset) {
			attempts.push({
				generator,
				toolset: generator.toolset,
				label: `${generator.label} (toolset ${generator.toolset})`,
			});
			attempts.push({
				generator,
				toolset: undefined,
				label: `${generator.label} (default toolset)`,
			});
		} else {
			attempts.push({
				generator,
				toolset: undefined,
				label: generator.label,
			});
		}
	}

	return attempts;
}

export function configureWithWindowsCmakeGenerator({
	prefix,
	configure,
	clearCache,
	log = console.log,
}) {
	let lastError;
	const attempts = getWindowsCmakeGeneratorAttempts();

	for (let index = 0; index < attempts.length; index += 1) {
		const attempt = attempts[index];
		clearCache();

		try {
			configure(attempt.generator.name, attempt.toolset);
			return attempt.generator.name;
		} catch (error) {
			lastError = error;
			const nextAttempt = attempts[index + 1];
			if (nextAttempt) {
				log(`[${prefix}] ${attempt.label} unavailable, trying ${nextAttempt.label}...`);
			}
		}
	}

	throw lastError;
}
