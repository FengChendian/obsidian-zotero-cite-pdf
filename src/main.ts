import { Editor, MarkdownView, Plugin, ObsidianProtocolData, Platform } from 'obsidian';
import { DEFAULT_SETTINGS, ZoteroCitePDFPluginSettings, ZoteroCiteSettingTab, DEFAULT_DEVICE_SETTINGS, DeviceSpecificSettings } from "./settings";
import fs from 'node:fs';
import initSqlJs, { Database } from "sql.js";
import open from 'open';
import { ZoteroSearchModal } from 'search-modal';
import wasmBinary from "../node_modules/sql.js/dist/sql-wasm.wasm";
import { normalize } from 'path';
import os from 'os';
import path from 'node:path';


export default class ZoteroCitePDFPlugin extends Plugin {
	settings: ZoteroCitePDFPluginSettings;
	db: Database;
	deviceIdentifier: string;

	async onload() {
		this.deviceIdentifier = await this.getDeviceIdentifier();
		await this.loadSettings();


		// This creates an icon in the left ribbon.
		this.addRibbonIcon('library', 'Search literature', async (evt: MouseEvent) => {
			// Called when the user clicks the icon.
			await this.tryInitZoteroDatabase(this.currentDeviceSettings.zoteroDatabaseSqlFile);
			new ZoteroSearchModal(this.app, this.db, this.settings.excludedExtensions).open();
		});

		// This adds a open command that can be triggered anywhere
		this.addCommand({
			id: 'open-zotero-search',
			name: 'Search Zotero literature',

			editorCallback: async (editor: Editor, view: MarkdownView) => {
				// try initialize the database if not already done
				await this.tryInitZoteroDatabase(this.currentDeviceSettings.zoteroDatabaseSqlFile);
				new ZoteroSearchModal(this.app, this.db, this.settings.excludedExtensions).open();
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new ZoteroCiteSettingTab(this.app, this));

		// Register Obsidian protocol handler for zotero-cite-pdf
		this.registerObsidianProtocolHandler("zotero-cite-pdf", async (params: ObsidianProtocolData) => {
			let fullPath: string | undefined = params.fullPath;
			const type = params.type;
			if (!fullPath) return;

			fullPath = normalize(decodeURIComponent(fullPath));

			let finalPath = path.join(this.currentDeviceSettings.zoteroDatabaseDir, fullPath);

			if (Platform.isWin) {
				finalPath = path.win32.normalize(finalPath);
				finalPath = `"${finalPath}"`;
			}

			// console.log(finalPath)
			if (type === 'PDF') {
				await open(
					finalPath,
					{ app: { name: this.currentDeviceSettings.pdfAppPath } }
				);
			}
			// open with browser for non-PDF types
			else {
				await
					open(
						finalPath,
						{ app: { name: this.currentDeviceSettings.browserAppPath } }
					)
			}

		});

	}

	async getDeviceIdentifier(): Promise<string> {

		let deviceName: string | null = null;
		if (Platform.isDesktop) {
			try {
				deviceName = os.hostname();
			} catch (e) {
				deviceName = 'Desktop-Unknown';
				console.error("Error getting hostname:", e);
				// Fallback to generic desktop name
			}
		} else {
			deviceName = Platform.isIosApp ? 'iPhone/iPad' : 'Android-Device';
		}
		if (!deviceName) {
			deviceName = 'default';
		}
		// 保存到本地存储，下次直接读取
		// localStorage.setItem('zotero-cite-pdf-device-name', deviceName);
		return deviceName;
	}

	async tryInitZoteroDatabase(absolutePath: string) {

		if (!this.db) {
			this.db = await this.loadDatabase(absolutePath);
			try {
				// 某些版本的 SQLite 环境支持 query_only
				// Some versions of SQLite environment support query_only
				this.db.run("PRAGMA query_only = ON;");
			} catch (e) {
				console.warn("PRAGMA query_only not supported, falling back to manual read-only logic. Error:", e);
			}
		}
	}

	async loadDatabase(absolutePath: string): Promise<Database> {
		const SQL = await initSqlJs({
			wasmBinary: wasmBinary
		});
		const fileBuffer = fs.readFileSync(absolutePath);
		return new SQL.Database(new Uint8Array(fileBuffer));
	}


	onunload() {
	}

	async loadSettings() {
		const loadedData = await this.loadData() as ZoteroCitePDFPluginSettings;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);

		// 确保当前设备的配置初始化
		if (!this.settings.devices[this.deviceIdentifier]) {
			this.settings.devices[this.deviceIdentifier] = { ...DEFAULT_DEVICE_SETTINGS };
		}
	}

	get currentDeviceSettings(): DeviceSpecificSettings {
		return this.settings.devices[this.deviceIdentifier] ?? DEFAULT_DEVICE_SETTINGS;
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
