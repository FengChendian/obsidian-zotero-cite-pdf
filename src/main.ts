import { Editor, MarkdownView, Plugin, ObsidianProtocolData, Platform } from 'obsidian';
import { DEFAULT_SETTINGS, ZoteroCitePDFPluginSettings, ZoteroCiteSettingTab, DEFAULT_DEVICE_SETTINGS, DeviceSpecificSettings } from "./settings";
import open from 'open';
import { ZoteroSearchModal } from 'search-modal';

import os from 'os';
import path from 'node:path';


export default class ZoteroCitePDFPlugin extends Plugin {
	settings: ZoteroCitePDFPluginSettings;
	deviceIdentifier: string;


	async onload() {
		this.deviceIdentifier = await this.getDeviceIdentifier();
		await this.loadSettings();


		// This creates an icon in the left ribbon.
		this.addRibbonIcon('library', 'Search literature', async (evt: MouseEvent) => {
			// Called when the user clicks the icon.
			// await this.tryInitZoteroDatabase(this.currentDeviceSettings.zoteroDatabaseSqlFile);
			new ZoteroSearchModal(this.app, this.currentDeviceSettings.zoteroDatabaseSqlFile, this.settings.excludedExtensions).open();
		});

		// This adds a open command that can be triggered anywhere
		this.addCommand({
			id: 'open-zotero-search',
			name: 'Search Zotero literature',

			editorCallback: async (editor: Editor, view: MarkdownView) => {
				// try initialize the database if not already done
				// await this.tryInitZoteroDatabase(this.currentDeviceSettings.zoteroDatabaseSqlFile);
				new ZoteroSearchModal(this.app, this.currentDeviceSettings.zoteroDatabaseSqlFile, this.settings.excludedExtensions).open();
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new ZoteroCiteSettingTab(this.app, this));

		// Register Obsidian protocol handler for zotero-cite-pdf
		this.registerObsidianProtocolHandler("zotero-cite-pdf", async (params: ObsidianProtocolData) => {
			let fullPath: string | undefined = params.fullPath;
			const type = params.type;
			if (!fullPath) return;

			let sanitizedPath = decodeURIComponent(fullPath).replace(/\\/g, '/');

			let finalPath = path.resolve(this.currentDeviceSettings.zoteroDatabaseDir, sanitizedPath);

			if (Platform.isWin) {
				// ensure Windows style slashes
				finalPath = path.win32.normalize(finalPath);
				finalPath = `"${finalPath}"`;
			} else {
				// ensure POSIX style slashes for macOS/Linux
				finalPath = path.posix.normalize(finalPath);
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
