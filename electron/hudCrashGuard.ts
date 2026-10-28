
/**
 * The HUD renderer owns the stop button, so when it crashes mid-recording the
 * native capture keeps writing to a temp file and nobody ever finalizes it: the
 * whole take is lost. The recording IPC registers its stop handler here so the
 * main process can finish the file by itself (issue #1145).
 */
type StopRecordingHandler = () => Promise<unknown>;

let stopRecordingHandler: StopRecordingHandler | null = null;

export function registerHudCrashStopHandler(handler: StopRecordingHandler) {
	stopRecordingHandler = handler;
}

export async function handleHudRendererCrash(reason: string): Promise<unknown> {
	if (!stopRecordingHandler) {
		return null;
	}
	console.warn(
		`[hud] recording overlay renderer gone (${reason}); stopping the capture so the file is finalized`,
	);
	try {
		return await stopRecordingHandler();
	} catch (error) {
		console.error("[hud] could not stop the recording after the renderer crash", error);
		return null;
	}
}

export function getHudCrashStopHandler() {
	return stopRecordingHandler;
}
