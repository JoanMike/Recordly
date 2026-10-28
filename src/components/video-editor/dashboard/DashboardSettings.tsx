import { SettingsSections, SettingsCategory } from "../SettingsSections";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { SettingsRow } from "../SettingsRow";
import { Switch } from "@/components/ui/switch";
import { supportsHudCaptureProtection } from "@/lib/hudCaptureProtection";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
export const DashboardSettingsContext = createContext<ReactNode>(null);

const formatBytes = (bytes: number) => {
	const gb = bytes / 1024 ** 3;
	if (gb >= 1) return `${gb.toFixed(1)} GB`;
	return `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;
};

const numberInputClass =
	"h-8 w-20 rounded-md border border-foreground/15 bg-transparent px-2 text-sm text-foreground";
export function DashboardSettings({ onImportFile }: { onImportFile: () => Promise<void> }) {
	const settingsContent = useContext(DashboardSettingsContext);
	const [directory, setDirectory] = useState("");
	const [recordings, setRecordings] = useState("");
	const [hideHud, setHideHud] = useState(true);
	const [captureSupported, setCaptureSupported] = useState(false);
	const [busy, setBusy] = useState(false);
	const [autoStopMinutes, setAutoStopMinutes] = useState(0);
	const [lowDiskWarnGb, setLowDiskWarnGb] = useState(2);
	const [storage, setStorage] = useState<{ bytes: number; recordings: number } | null>(null);
	const [purgeDays, setPurgeDays] = useState(30);
	const run = async (action: () => Promise<void>) => {
		setBusy(true);
		try {
			await action();
		} catch (error) {
			toast.error(String(error));
		} finally {
			setBusy(false);
		}
	};
	useEffect(() => {
		let active = true;
		void Promise.all([
			window.electronAPI.getRecordingPreferences(),
			window.electronAPI.getRecordingsStorageUsage(),
		]).then(([prefs, usage]) => {
			if (!active) return;
			if (prefs) {
				if (typeof prefs.autoStopMinutes === "number") setAutoStopMinutes(prefs.autoStopMinutes);
				if (typeof prefs.lowDiskWarnGb === "number") setLowDiskWarnGb(prefs.lowDiskWarnGb);
			}
			if (usage.success && typeof usage.bytes === "number" && typeof usage.recordings === "number") {
				setStorage({ bytes: usage.bytes, recordings: usage.recordings });
			}
		});
		return () => {
			active = false;
		};
	}, []);

	useEffect(() => {
		let active = true;
		void Promise.all([
			window.electronAPI.getRecordingsDirectory(),
			window.electronAPI.getHudOverlayCaptureProtection(),
			window.electronAPI.getPlatform(),
		])
			.then(([directory, protection, platform]) => {
				if (!active) return;
				if (directory.success) setRecordings(directory.path);
				if (protection.success) setHideHud(protection.enabled);
				setCaptureSupported(supportsHudCaptureProtection(platform));
			})
			.catch((error) => toast.error(String(error)));
		return () => {
			active = false;
		};
	}, []);
	return (
		<section aria-label="Dashboard settings" className="dashboard-settings max-w-2xl py-10">
			<h1 className="mb-8 text-lg font-semibold">Settings</h1>
			<SettingsSections
				categories={["general", "permissions", "motion", "recording", "files"]}
			>
				<SettingsCategory category={["general", "permissions", "motion"]}>
					{settingsContent}
				</SettingsCategory>
				<SettingsCategory category="files">
					<SettingsRow title="Open video or project">
						<Button
							variant="secondary"
							size="sm"
							disabled={busy}
							onClick={() => void run(onImportFile)}
						>
							Open file
						</Button>
					</SettingsRow>
					<SettingsRow
						title="Recordings storage"
						description={
							storage
								? `${formatBytes(storage.bytes)} in ${storage.recordings} recording${
										storage.recordings === 1 ? "" : "s"
									}`
								: "Calculating…"
						}
					>
						<Button
							variant="secondary"
							size="sm"
							disabled={busy}
							onClick={() =>
								void run(async () => {
									if (recordings) await window.electronAPI.revealInFolder(recordings);
								})
							}
						>
							Open folder
						</Button>
					</SettingsRow>
					<SettingsRow
						title="Delete old recordings"
						description="Removes the video and its sidecars. Anything from the last hour is kept."
					>
						<div className="flex items-center gap-2">
							<select
								value={purgeDays}
								disabled={busy}
								aria-label="Delete recordings older than"
								className="h-8 rounded-md border border-foreground/15 bg-transparent px-2 text-sm text-foreground"
								onChange={(event) => setPurgeDays(Number(event.target.value))}
							>
								<option value={7}>7 days</option>
								<option value={30}>30 days</option>
								<option value={90}>90 days</option>
							</select>
							<Button
								variant="secondary"
								size="sm"
								disabled={busy}
								onClick={() =>
									void run(async () => {
										const result =
											await window.electronAPI.purgeOldRecordings(purgeDays);
										if (!result.success) throw Error(result.error ?? "Could not delete");
										toast.success(
											`Deleted ${result.removed ?? 0} recording(s), freed ${formatBytes(
												result.freedBytes ?? 0,
											)}`,
										);
										const usage = await window.electronAPI.getRecordingsStorageUsage();
										if (
											usage.success &&
											typeof usage.bytes === "number" &&
											typeof usage.recordings === "number"
										) {
											setStorage({ bytes: usage.bytes, recordings: usage.recordings });
										}
									})
								}
							>
								Delete
							</Button>
						</div>
					</SettingsRow>
				</SettingsCategory>
				<SettingsCategory category="recording">
					<SettingsRow
						title="Recordings folder"
						description={
							<span className="block truncate" title={recordings}>
								{recordings}
							</span>
						}
					>
						<Button
							variant="secondary"
							size="sm"
							disabled={busy}
							onClick={() =>
								void run(async () => {
									const result =
										await window.electronAPI.chooseRecordingsDirectory();
									if (result.canceled) return;
									if (!result.success || !result.path)
										throw Error("Could not change recordings folder");
									setRecordings(result.path);
								})
							}
						>
							Change folder
						</Button>
					</SettingsRow>
					{captureSupported && (
						<SettingsRow
							title="Hide HUD from recordings"
							description="Only while recording. The idle HUD stays visible in captures."
						>
							<Switch
								aria-label="Hide HUD from recordings"
								checked={hideHud}
								disabled={busy}
								onCheckedChange={(enabled) =>
									void run(async () => {
										const result =
											await window.electronAPI.setHudOverlayCaptureProtection(
												enabled,
											);
										if (!result.success)
											throw Error("Could not update capture protection");
										setHideHud(result.enabled);
									})
								}
							/>
						</SettingsRow>
					)}
					<SettingsRow
						title="Stop recording automatically"
						description="Minutes. Use 0 to record without a limit."
					>
						<input
							type="number"
							min={0}
							max={600}
							value={autoStopMinutes}
							disabled={busy}
							aria-label="Auto-stop minutes"
							className={numberInputClass}
							onChange={(event) =>
								setAutoStopMinutes(Math.max(0, Number(event.target.value) || 0))
							}
							onBlur={() =>
								void run(async () => {
									const result = await window.electronAPI.setRecordingPreferences({
										autoStopMinutes,
									});
									if (!result.success) throw Error("Could not save the limit");
									toast.success("Auto-stop updated");
								})
							}
						/>
					</SettingsRow>
					<SettingsRow
						title="Low disk warning"
						description="Notify when the recordings drive has less than this many GB free."
					>
						<input
							type="number"
							min={1}
							max={100}
							value={lowDiskWarnGb}
							disabled={busy}
							aria-label="Low disk warning GB"
							className={numberInputClass}
							onChange={(event) =>
								setLowDiskWarnGb(Math.max(1, Number(event.target.value) || 1))
							}
							onBlur={() =>
								void run(async () => {
									const result = await window.electronAPI.setRecordingPreferences({
										lowDiskWarnGb,
									});
									if (!result.success) throw Error("Could not save the warning");
									toast.success("Disk warning updated");
								})
							}
						/>
					</SettingsRow>
				</SettingsCategory>
				<SettingsCategory category="files">
					<SettingsRow
						title="Projects folder"
						description={directory || "Named projects save automatically."}
					>
						<Button
							variant="secondary"
							size="sm"
							onClick={async () => {
								try {
									const result = await window.electronAPI.getProjectsDirectory();
									if (!result.success || !result.path)
										throw Error("Could not open projects folder");
									setDirectory(result.path);
									await window.electronAPI.revealInFolder(result.path);
								} catch (e) {
									toast.error(String(e));
								}
							}}
						>
							Show folder
						</Button>
					</SettingsRow>
					<p className="text-xs text-muted-foreground">
						Named projects save automatically. Previews refresh when you return to
						Projects.
					</p>
				</SettingsCategory>
			</SettingsSections>
		</section>
	);
}
