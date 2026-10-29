import path from "node:path";
import { app } from "electron";

if (!process.env["VITE_DEV_SERVER_URL"]) {
	// The fork ships as "Recordly Local", but the storage identity stays
	// "Recordly" so existing settings, shortcuts, teleprompter text and the
	// default recordings folder survive the rename.
	app.setPath("userData", path.join(app.getPath("appData"), "Recordly"));
}

if (process.env["VITE_DEV_SERVER_URL"]) {
	const devUserDataPath = path.join(app.getPath("appData"), "Recordly-dev");
	app.setPath("userData", devUserDataPath);
	app.setPath("sessionData", path.join(devUserDataPath, "session"));
}

export const USER_DATA_PATH = app.getPath("userData");
export const RECORDINGS_DIR = path.join(USER_DATA_PATH, "recordings");
