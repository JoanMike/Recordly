import { type RefObject, useEffect, useRef } from "react";
import type { useShortcuts } from "@/contexts/ShortcutsContext";
import { matchesShortcut } from "@/lib/shortcuts";
import type { useTimelineState } from "../state/useTimelineState";
import type { VideoPlaybackRef } from "../VideoPlayback";

type Input = {
	timeline: ReturnType<typeof useTimelineState>;
	videoPlaybackRef: RefObject<VideoPlaybackRef | null>;
	shortcuts: ReturnType<typeof useShortcuts>["shortcuts"];
	isMac: boolean;
	handleUndo: () => void;
	handleRedo: () => void;
	startPlayback: () => void;
};

export function useEditorGlobalInteractions({
	timeline,
	videoPlaybackRef,
	shortcuts,
	isMac,
	handleUndo,
	handleRedo,
	startPlayback,
}: Input) {
	const heldPlaybackKey = useRef<string | null>(null);

	useEffect(() => {
		const consumePlaybackKey = (event: KeyboardEvent) => {
			event.preventDefault();
			// React Aria buttons also handle Space. Own both halves of this shortcut
			// so their press handler cannot toggle playback a second time.
			event.stopImmediatePropagation();
		};
		const keyIdentity = (event: KeyboardEvent) => event.code || event.key.toLowerCase();
		const handleKeyUp = (event: KeyboardEvent) => {
			if (heldPlaybackKey.current !== keyIdentity(event)) return;
			heldPlaybackKey.current = null;
			consumePlaybackKey(event);
		};
		const releasePlaybackKey = () => {
			heldPlaybackKey.current = null;
		};
		const handleKeyDown = (event: KeyboardEvent) => {
			if (heldPlaybackKey.current === keyIdentity(event)) {
				consumePlaybackKey(event);
				return;
			}
			if (event.defaultPrevented || event.isComposing) return;
			const target = event.target as HTMLElement | null;
			if (target?.closest?.("[data-recording-library]")) return;
			const editable =
				target instanceof HTMLInputElement ||
				target instanceof HTMLTextAreaElement ||
				target instanceof HTMLSelectElement ||
				target?.isContentEditable;
			const key = event.key.toLowerCase();

			if (editable) return;
			if (matchesShortcut(event, shortcuts.undo, isMac)) {
				event.preventDefault();
				handleUndo();
				return;
			}
			if (matchesShortcut(event, shortcuts.redo, isMac)) {
				event.preventDefault();
				handleRedo();
				return;
			}
			// Ctrl+Y stays bound on Windows as a second redo, even if the user
			// rebinds the configurable one.
			if (!isMac && event.ctrlKey && !event.metaKey && !event.altKey && key === "y") {
				event.preventDefault();
				handleRedo();
				return;
			}
			if (matchesShortcut(event, shortcuts.goToStart, isMac)) {
				event.preventDefault();
				videoPlaybackRef.current?.seekTimeline(0);
				return;
			}
			if (matchesShortcut(event, shortcuts.goToEnd, isMac)) {
				event.preventDefault();
				const playback = videoPlaybackRef.current;
				if (playback?.video) playback.seekTimeline(playback.video.duration || 0);
				return;
			}
			if (!matchesShortcut(event, shortcuts.playPause, isMac)) return;
			consumePlaybackKey(event);
			if (event.repeat) return;
			heldPlaybackKey.current = keyIdentity(event);
			const playback = videoPlaybackRef.current;
			if (!playback?.video) return;
			if (!playback.isPlaying) startPlayback();
			else playback.pause();
		};
		window.addEventListener("keydown", handleKeyDown, { capture: true });
		window.addEventListener("keyup", handleKeyUp, { capture: true });
		window.addEventListener("blur", releasePlaybackKey);
		return () => {
			window.removeEventListener("keydown", handleKeyDown, { capture: true });
			window.removeEventListener("keyup", handleKeyUp, { capture: true });
			window.removeEventListener("blur", releasePlaybackKey);
		};
	}, [shortcuts, isMac, handleUndo, handleRedo, startPlayback, videoPlaybackRef]);

	useEffect(() => {
		if (
			timeline.selectedZoomId &&
			!timeline.zoomRegions.some(({ id }) => id === timeline.selectedZoomId)
		) {
			timeline.setSelectedZoomId(null);
		}
	}, [timeline.selectedZoomId, timeline.zoomRegions, timeline.setSelectedZoomId]);
	useEffect(() => {
		if (
			timeline.selectedAnnotationId &&
			!timeline.annotationRegions.some(({ id }) => id === timeline.selectedAnnotationId)
		) {
			timeline.setSelectedAnnotationId(null);
		}
	}, [
		timeline.selectedAnnotationId,
		timeline.annotationRegions,
		timeline.setSelectedAnnotationId,
	]);
	useEffect(() => {
		if (
			timeline.selectedAudioId &&
			!timeline.audioRegions.some(({ id }) => id === timeline.selectedAudioId)
		) {
			timeline.setSelectedAudioId(null);
		}
	}, [timeline.selectedAudioId, timeline.audioRegions, timeline.setSelectedAudioId]);
	useEffect(() => {
		if (
			timeline.selectedCaptionId &&
			!timeline.autoCaptions.some(({ id }) => id === timeline.selectedCaptionId)
		) {
			timeline.setSelectedCaptionId(null);
		}
	}, [timeline.selectedCaptionId, timeline.autoCaptions, timeline.setSelectedCaptionId]);
}
