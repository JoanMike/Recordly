import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import {
	ArrowClockwiseIcon,
	DotsThreeVerticalIcon,
	House,
	MicrophoneIcon,
	MicrophoneSlashIcon,
	MinusIcon,
	MonitorIcon,
	TextT as NoteIcon,
	TimerIcon,
	VideoCameraIcon,
	VideoCameraSlashIcon,
	XIcon,
} from "@/components/ui/icons";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/components/ui/toast";
import { useScopedT } from "../../contexts/I18nContext";
import { useMicrophoneDevices } from "../../hooks/useMicrophoneDevices";
import { useScreenRecorder } from "../../hooks/useScreenRecorder";
import { useVideoDevices } from "../../hooks/useVideoDevices";
import { Button } from "../ui/button";
import { HudInteractionContext } from "./contexts/HudInteractionContext";
import {
	canToggleFloatingWebcamPreview,
	WEBCAM_PREVIEW_RESIZE_HANDLES,
} from "./floatingWebcamPreview";
import { useHudBarDrag } from "./hooks/useHudBarDrag";
import { useLaunchHudInteractionState } from "./hooks/useLaunchHudInteractionState";
import { useLaunchWindowActions } from "./hooks/useLaunchWindowActions";
import { useLaunchWindowSystemState } from "./hooks/useLaunchWindowSystemState";
import { useRecordingTimer } from "./hooks/useRecordingTimer";
import { useWebcamPreviewOverlay } from "./hooks/useWebcamPreviewOverlay";
import styles from "./LaunchWindow.module.css";
import { MarqueeText } from "./MarqueeText";
import { CountdownPopover } from "./popovers/CountdownPopover";
import {
	LaunchPopoverCoordinatorProvider,
	useLaunchPopoverCoordinator,
} from "./popovers/LaunchPopoverCoordinator";
import { MicPopover } from "./popovers/MicPopover";
import { WebcamPopover } from "./popovers/WebcamPopover";
import { RecordingControls } from "./RecordingControls";

export function LaunchWindow() {
	return (
		<LaunchPopoverCoordinatorProvider>
			<LaunchWindowContent />
		</LaunchPopoverCoordinatorProvider>
	);
}

function LaunchWindowContent() {
	const t = useScopedT("launch");
	const { openId } = useLaunchPopoverCoordinator();

	const {
		recording,
		paused,
		finalizing,
		countdownActive,
		toggleRecording,
		pauseRecording,
		resumeRecording,
		cancelRecording,
		cancelRecordingStart,
		microphoneEnabled,
		setMicrophoneEnabled,
		microphoneDeviceId,
		setMicrophoneDeviceId,
		systemAudioEnabled,
		setSystemAudioEnabled,
		webcamEnabled,
		setWebcamEnabled,
		webcamDeviceId,
		setWebcamDeviceId,
		countdownDelay,
		setCountdownDelay,
		preparePermissions,
	} = useScreenRecorder();

	const { elapsed, formatTime } = useRecordingTimer(recording, paused);
	const hudContentRef = useRef<HTMLDivElement>(null);
	const hudBarRef = useRef<HTMLDivElement>(null);

	const { selectedSource, hasSelectedSource, syncSelectedSource } = useLaunchWindowActions();

	const showWebcamControls = webcamEnabled && !recording;
	const { devices, selectedDeviceId, setSelectedDeviceId } = useMicrophoneDevices(
		microphoneEnabled || openId === "mic",
		microphoneDeviceId,
	);
	const {
		devices: videoDevices,
		selectedDeviceId: selectedVideoDeviceId,
		setSelectedDeviceId: setSelectedVideoDeviceId,
	} = useVideoDevices(webcamEnabled || openId === "webcam");

	const { hudOverlayMousePassthroughSupported, platform } =
		useLaunchWindowSystemState(preparePermissions);

	useEffect(() => {
		if (!selectedDeviceId) {
			return;
		}

		setMicrophoneDeviceId(selectedDeviceId === "default" ? undefined : selectedDeviceId);
	}, [selectedDeviceId, setMicrophoneDeviceId]);

	useEffect(() => {
		if (selectedVideoDeviceId && selectedVideoDeviceId !== "default") {
			setWebcamDeviceId(selectedVideoDeviceId);
		}
	}, [selectedVideoDeviceId, setWebcamDeviceId]);

	// Global accelerators registered by the main process (#6).
	useEffect(() => {
		const api = window.electronAPI;
		if (!api?.onGlobalShortcut) return;
		return api.onGlobalShortcut((action) => {
			if (action === "toggle-recording") {
				void toggleRecording();
				return;
			}
			if (action === "pause-resume") {
				if (paused) resumeRecording();
				else pauseRecording();
			}
		});
	}, [paused, pauseRecording, resumeRecording, toggleRecording]);

	const {
		showFloatingWebcamPreview,
		setShowFloatingWebcamPreview,
		showRecordingWebcamPreview,
		webcamPreviewOffset,
		webcamPreviewSize,
		recordingWebcamPreviewContainerRef,
		isWebcamPreviewDraggingRef,
		webcamPreviewDragStartRef,
		handleWebcamPreviewPointerDown,
		handleWebcamPreviewPointerMove,
		handleWebcamPreviewPointerUp,
		handleWebcamPreviewResizePointerDown,
		handleWebcamPreviewResizePointerMove,
		handleWebcamPreviewResizePointerUp,
		setWebcamPreviewNode,
		setRecordingWebcamPreviewNode,
	} = useWebcamPreviewOverlay({
		webcamEnabled,
		webcamDeviceId,
		showWebcamControls,
		webcamPopoverOpen: openId === "webcam",
		hudOverlayMousePassthroughSupported,
	});

	useEffect(() => {
		window.electronAPI?.hudOverlaySetWebcamPreviewVisible?.(showRecordingWebcamPreview);
	}, [showRecordingWebcamPreview]);

	useEffect(() => {
		return () => {
			window.electronAPI?.hudOverlaySetWebcamPreviewVisible?.(false);
		};
	}, []);

	const {
		recordingHudOffset,
		isHudDragging,
		hudBarTransformRef,
		isHudDraggingRef,
		handleHudBarPointerDown,
		handleHudBarPointerMove,
		handleHudBarPointerUp,
	} = useHudBarDrag({
		hudContentRef,
		hudBarRef,
		recordingWebcamPreviewContainerRef,
	});

	// The HUD window spans the whole work area. Report the visible bar so the main
	// process can keep everything else click-through while recording (#657).
	useEffect(() => {
		const api = window.electronAPI;
		if (!api?.hudOverlaySetInteractiveBounds) return;
		if (openId !== null) {
			api.hudOverlaySetInteractiveBounds(null);
			return;
		}
		const report = () => {
			const bar = hudBarRef.current;
			if (!bar) return;
			const rect = bar.getBoundingClientRect();
			api.hudOverlaySetInteractiveBounds({
				x: rect.left,
				y: rect.top,
				width: rect.width,
				height: rect.height,
			});
		};
		report();
		const observer = new ResizeObserver(report);
		if (hudBarRef.current) observer.observe(hudBarRef.current);
		window.addEventListener("resize", report);
		const interval = window.setInterval(report, 500);
		return () => {
			observer.disconnect();
			window.removeEventListener("resize", report);
			window.clearInterval(interval);
		};
	}, [openId]);

	const { handleHudMouseEnter, handleHudMouseLeave, beginInteractiveHudAction } =
		useLaunchHudInteractionState({
			openId,
			isHudDraggingRef,
			isWebcamPreviewDraggingRef,
			webcamPreviewDragStartRef,
		});

	const hudStateTransition = {
		duration: 0.24,
		ease: [0.22, 1, 0.36, 1] as const,
	};

	const pickerPending = useRef(false);
	const [isPickerPending, setIsPickerPending] = useState(false);
	const [sourceReady, setSourceReady] = useState(false);
	const handlePickOnScreen = useCallback(async () => {
		if (pickerPending.current || recording || finalizing) return;
		pickerPending.current = true;
		setIsPickerPending(true);
		beginInteractiveHudAction();
		try {
			if (!(await cancelRecordingStart())) return;
			if (!(await preparePermissions())) return;
			const result = await window.electronAPI.pickCaptureTarget();
			if (result.success && result.source) syncSelectedSource(result.source);
			if (result.message && !result.canceled) {
				if (result.success) toast.info(result.message);
				else toast.error(result.message);
			}
		} catch {
			toast.error("Unable to open the source picker.");
		} finally {
			pickerPending.current = false;
			setIsPickerPending(false);
		}
	}, [
		recording,
		cancelRecordingStart,
		preparePermissions,
		finalizing,
		beginInteractiveHudAction,
		syncSelectedSource,
	]);

	useEffect(() => {
		let mounted = true;
		let selectionEventSeen = false;

		void window.electronAPI
			.getSelectedSource()
			.then((source) => {
				if (mounted) setSourceReady(true);
				if (mounted && !selectionEventSeen) {
					syncSelectedSource(source);
				}
			})
			.catch(() => {
				if (mounted) {
					setSourceReady(true);
					toast.error("Unable to load the recording source. Pick a screen again.");
				}
			});

		const cleanup = window.electronAPI.onSelectedSourceChanged((source) => {
			selectionEventSeen = true;
			if (mounted) syncSelectedSource(source);
		});

		return () => {
			mounted = false;
			cleanup?.();
		};
	}, [syncSelectedSource]);

	const openHome = () => {
		localStorage.setItem("recordly.open-dashboard", String(Date.now()));
		void window.electronAPI.showProjectDashboard();
	};
	const homeButton = (
		<IconTooltip placement="top" label={t("recording.home", "Inicio")}>
			<Button
				variant="ghost"
				size="icon"
				iconSize="lg"
				aria-label={t("recording.home", "Inicio")}
				onClick={openHome}
			>
				<House weight="fill" className="size-5" />
			</Button>
		</IconTooltip>
	);

	const recordingControls = (
		<RecordingControls
			onHome={openHome}
			paused={paused}
			microphoneEnabled={microphoneEnabled}
			elapsed={elapsed}
			onPauseResume={paused ? resumeRecording : pauseRecording}
			onStopRecording={toggleRecording}
			onHideHud={() => window.electronAPI?.hudOverlayHide?.()}
			onCancelRecording={cancelRecording}
			formatTime={formatTime}
		/>
	);

	const idleControls = (
		<>
			<Button
				variant="ghost"
				size="lg"
				className={`${styles.electronNoDrag} group gap-2 px-3 min-w-0 max-w-[180px] shrink-0`}
				title={selectedSource}
				aria-label="Choose recording source"
				disabled={isPickerPending || !sourceReady || recording || finalizing}
				onClick={() => void handlePickOnScreen()}
			>
				<MonitorIcon size={18} className="size-5 shrink-0" />
				<div className="flex-1 min-w-0 overflow-hidden">
					{hasSelectedSource ? (
						<MarqueeText text={selectedSource} />
					) : (
						<span>Pick screen</span>
					)}
				</div>
			</Button>
			<Separator orientation="vertical" className="mx-[5px] h-6 self-center" />

			<MicPopover
				disabled={recording}
				systemAudioEnabled={systemAudioEnabled}
				onToggleSystemAudio={() => setSystemAudioEnabled(!systemAudioEnabled)}
				microphoneEnabled={microphoneEnabled}
				onDisableMicrophone={() => setMicrophoneEnabled(false)}
				devices={devices}
				microphoneDeviceId={microphoneDeviceId}
				selectedDeviceId={selectedDeviceId}
				onSelectDevice={(deviceId) => {
					setMicrophoneEnabled(true);
					setSelectedDeviceId(deviceId);
					setMicrophoneDeviceId(deviceId === "default" ? undefined : deviceId);
				}}
				trigger={
					<IconTooltip
						placement="top"
						label={
							microphoneEnabled
								? t("recording.disableMicrophone", "Desactivar micrófono")
								: t("recording.enableMicrophone", "Activar micrófono")
						}
					>
						<Button
							variant="ghost"
							size="icon"
							iconSize="lg"
							aria-label={
								microphoneEnabled
									? t("recording.disableMicrophone", "Desactivar micrófono")
									: t("recording.enableMicrophone", "Activar micrófono")
							}
							className={microphoneEnabled ? "text-accent" : ""}
						>
							{microphoneEnabled ? (
								<MicrophoneIcon
									weight={microphoneEnabled ? "fill" : "regular"}
									className="size-5"
									size={18}
								/>
							) : (
								<MicrophoneSlashIcon className="size-5" />
							)}
						</Button>
					</IconTooltip>
				}
			/>

			<WebcamPopover
				disabled={recording}
				webcamEnabled={webcamEnabled}
				onDisableWebcam={() => setWebcamEnabled(false)}
				canToggleFloatingPreview={canToggleFloatingWebcamPreview(
					hudOverlayMousePassthroughSupported,
				)}
				showFloatingWebcamPreview={showFloatingWebcamPreview}
				onToggleFloatingPreview={() => setShowFloatingWebcamPreview((current) => !current)}
				showWebcamControls={showWebcamControls}
				setWebcamPreviewNode={setWebcamPreviewNode}
				videoDevices={videoDevices}
				webcamDeviceId={webcamDeviceId}
				selectedVideoDeviceId={selectedVideoDeviceId}
				onSelectVideoDevice={(deviceId) => {
					setWebcamEnabled(true);
					setSelectedVideoDeviceId(deviceId);
					setWebcamDeviceId(deviceId);
				}}
				trigger={
					<IconTooltip
						placement="top"
						label={
							webcamEnabled
								? t("recording.disableWebcam", "Desactivar cámara")
								: t("recording.enableWebcam", "Activar cámara")
						}
					>
						<Button
							variant="ghost"
							size="icon"
							iconSize="lg"
							aria-label={
								webcamEnabled
									? t("recording.disableWebcam", "Desactivar cámara")
									: t("recording.enableWebcam", "Activar cámara")
							}
							className={webcamEnabled ? "text-accent" : ""}
						>
							{webcamEnabled ? (
								<VideoCameraIcon
									weight={webcamEnabled ? "fill" : "regular"}
									className="size-5"
									size={18}
								/>
							) : (
								<VideoCameraSlashIcon className="size-5" />
							)}
						</Button>
					</IconTooltip>
				}
			/>

			<CountdownPopover
				countdownDelay={countdownDelay}
				onSelectDelay={setCountdownDelay}
				trigger={
					<IconTooltip
						placement="top"
						label={t("recording.countdownDelay", "Retraso de cuenta regresiva")}
					>
						<Button
							variant="ghost"
							size="icon"
							iconSize="lg"
							aria-label={t(
								"recording.countdownDelay",
								"Retraso de cuenta regresiva",
							)}
							className={countdownDelay > 0 ? "text-accent" : ""}
						>
							<TimerIcon
								weight={openId === "countdown" ? "fill" : "regular"}
								className="size-5"
							/>
						</Button>
					</IconTooltip>
				}
			/>

			<IconTooltip placement="top" label="Teleprompter">
				<Button
					variant="ghost"
					size="icon"
					iconSize="lg"
					aria-label="Abrir el teleprompter"
					onClick={() => window.electronAPI?.openTeleprompter?.()}
				>
					<NoteIcon className="size-5" />
				</Button>
			</IconTooltip>

			<IconTooltip label={t("recording.record", "Grabar")}>
				<Button
					type="button"
					variant="destructive"
					size="icon"
					className={styles.electronNoDrag}
					onClick={hasSelectedSource ? toggleRecording : () => void handlePickOnScreen()}
					disabled={countdownActive || isPickerPending || !sourceReady}
					aria-label={t("recording.record", "Grabar")}
				>
					<div className={styles.recDot} />
				</Button>
			</IconTooltip>

			<Separator orientation="vertical" className="mx-[5px] h-6 self-center" />

			{homeButton}

			<IconTooltip label={t("recording.hideHud", "Ocultar la barra")}>
				<Button
					variant="ghost"
					size="icon"
					iconSize="lg"
					onClick={() => window.electronAPI?.hudOverlayHide?.()}
					aria-label={t("recording.hideHud", "Ocultar la barra")}
				>
					<MinusIcon className="size-5" />
				</Button>
			</IconTooltip>

			<Button
				variant="ghost"
				size="icon"
				iconSize="lg"
				onClick={() => window.electronAPI?.hudOverlayClose?.()}
				title={t("recording.closeApp")}
			>
				<XIcon className="size-5" />
			</Button>
		</>
	);

	const finalizingControls = (
		<div className={styles.finalizingState}>
			<ArrowClockwiseIcon size={15} className={styles.finalizingSpin} />
			<div className={styles.finalizingCopy}>
				<span>{t("recording.preparing", "Preparing recording")}</span>
				<small>{t("recording.preparingSubtitle", "Opening the editor in a moment")}</small>
			</div>
		</div>
	);

	const hudMode = finalizing ? "finalizing" : recording ? "recording" : "idle";
	const useNativeHudBarDrag =
		platform === "linux" || hudOverlayMousePassthroughSupported === false;
	const shouldAnimateHudLayout = !recording && !showRecordingWebcamPreview && !isHudDragging;

	return (
		<HudInteractionContext.Provider
			value={{ onMouseEnter: handleHudMouseEnter, onMouseLeave: handleHudMouseLeave }}
		>
			<div
				className="w-full flex justify-center bg-transparent overflow-visible items-end pb-5 pointer-events-none"
				style={{ height: "100vh" }}
			>
				<div
					ref={hudContentRef}
					className="flex items-center overflow-visible flex-col-reverse pointer-events-none"
				>
					<div className="flex flex-col items-center pointer-events-none p-2">
						<div
							ref={hudBarTransformRef}
							style={{
								transform: `translate3d(${recordingHudOffset.x}px, ${recordingHudOffset.y}px, 0)`,
							}}
						>
							<motion.div
								ref={hudBarRef}
								layout={shouldAnimateHudLayout}
								transition={hudStateTransition}
								className={`${styles.bar} launch-theme mb-2 pointer-events-auto`}
								onMouseEnter={handleHudMouseEnter}
								onMouseLeave={handleHudMouseLeave}
							>
								<div
									title={t("recording.dragHandle", "Arrastrar la barra")}
									aria-label={t("recording.dragHandle", "Arrastrar la barra")}
									// Linux compositors and non-passthrough Windows fallback windows
									// need native window dragging; the JS drag path only translates
									// content inside the HUD window.
									className={`flex items-center px-0.5 cursor-grab active:cursor-grabbing ${
										useNativeHudBarDrag ? styles.electronDrag : ""
									}`}
									onPointerDown={handleHudBarPointerDown}
									onPointerMove={handleHudBarPointerMove}
									onPointerUp={handleHudBarPointerUp}
									onPointerCancel={handleHudBarPointerUp}
								>
									<DotsThreeVerticalIcon
										weight="fill"
										size={18}
										className="text-[#6b6b78]"
									/>
								</div>

								<div className={styles.barStateViewport}>
									<AnimatePresence initial={false} mode="wait">
										<motion.div
											key={hudMode}
											layout={shouldAnimateHudLayout}
											className={styles.barState}
											initial={{
												opacity: 0,
												y: 10,
												scale: 0.985,
												filter: "blur(8px)",
											}}
											animate={{
												opacity: 1,
												y: 0,
												scale: 1,
												filter: "blur(0px)",
											}}
											exit={{
												opacity: 0,
												y: -10,
												scale: 0.985,
												filter: "blur(6px)",
											}}
											transition={hudStateTransition}
										>
											{finalizing
												? finalizingControls
												: recording
													? recordingControls
													: idleControls}
										</motion.div>
									</AnimatePresence>
								</div>
							</motion.div>
						</div>
						{showRecordingWebcamPreview && (
							<div
								ref={recordingWebcamPreviewContainerRef}
								className={`${styles.recordingWebcamPreview} ${styles.electronNoDrag} pointer-events-auto`}
								data-hud-interactive
								title={t("recording.webcam")}
								style={{
									transform: `translate(${webcamPreviewOffset.x}px, ${webcamPreviewOffset.y}px)`,
									width: webcamPreviewSize.width,
									height: webcamPreviewSize.height,
								}}
								onMouseEnter={handleHudMouseEnter}
								onMouseLeave={handleHudMouseLeave}
								onPointerDown={handleWebcamPreviewPointerDown}
								onPointerMove={handleWebcamPreviewPointerMove}
								onPointerUp={handleWebcamPreviewPointerUp}
								onPointerCancel={handleWebcamPreviewPointerUp}
							>
								<video
									ref={setRecordingWebcamPreviewNode}
									className={styles.recordingWebcamPreviewVideo}
									muted
									playsInline
									style={{ transform: "scaleX(-1)" }}
								/>
								{WEBCAM_PREVIEW_RESIZE_HANDLES.map((handle) => (
									<div
										key={handle}
										data-resize-handle={handle}
										className={styles.recordingWebcamPreviewResizeHandle}
										onPointerDown={handleWebcamPreviewResizePointerDown}
										onPointerMove={handleWebcamPreviewResizePointerMove}
										onPointerUp={handleWebcamPreviewResizePointerUp}
										onPointerCancel={handleWebcamPreviewResizePointerUp}
									/>
								))}
							</div>
						)}
					</div>
				</div>
			</div>
		</HudInteractionContext.Provider>
	);
}
