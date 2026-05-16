import { App, PluginSettingTab, Setting } from "obsidian";
import ZoteroCitePDFPlugin from "./main";
import path from "node:path";
import { t } from "./lang/lang-helper";

export interface DeviceSpecificSettings {
	pdfAppPath: string;
	browserAppPath: string;
	zoteroDatabaseDir: string;
	zoteroDatabaseSqlFile: string;
}

export interface ZoteroCitePDFPluginSettings {
	excludedExtensions: string[]; // Global excluded file extensions
	devices: Record<string, DeviceSpecificSettings>; // Device-specific settings
}

export const DEFAULT_DEVICE_SETTINGS: DeviceSpecificSettings = {
	pdfAppPath: '',
	browserAppPath: '',
	zoteroDatabaseDir: '',
	zoteroDatabaseSqlFile: '',
};

// 插件启动时的总默认值
export const DEFAULT_SETTINGS: ZoteroCitePDFPluginSettings = {
	excludedExtensions: [],
	devices: {}
}

export class ZoteroCiteSettingTab extends PluginSettingTab {
	plugin: ZoteroCitePDFPlugin;

	constructor(app: App, plugin: ZoteroCitePDFPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	async pickManualPath(): Promise<string | null> {
		const isWin = window.process.platform === 'win32';

		const filters = isWin
			? [{ name: t('EXECUTABALE_FILE'), extensions: ['exe', 'bat', 'cmd'] }]
			: [{ name: t('APPLICATION_FILE'), extensions: ['app'] }];

		try {
			// use Electron's dialog to open file picker
			const result = await window.electron.remote.dialog.showOpenDialog({
				title: t('EXPLORE_FILE'),
				properties: ['openFile'],
				filters: filters
			}) as { canceled: boolean; filePaths: string[] };

			if (result.canceled || result.filePaths.length === 0) {
				return null;
			}

			return result.filePaths[0] as string;
		} catch (error) {
			console.error("Error:", error);
			return null;
		}
	}

	display(): void {
		const { containerEl } = this;
		const deviceSettings = this.plugin.settings.devices[this.plugin.deviceIdentifier] || DEFAULT_DEVICE_SETTINGS;
		containerEl.empty();

		// Axiliary function to pick file or folder path
		const pickPath = async (isFolder: boolean, extensions?: string[]) => {

			const result = await window.electron.remote.dialog.showOpenDialog({
				properties: [isFolder ? 'openDirectory' : 'openFile'],
				filters: extensions ? [{ name: 'Allowed Files', extensions }] : []
			}) as { canceled: boolean; filePaths: string[] };
			return result.canceled ? null : result.filePaths[0] as string;
		};

		this.addPathSetting(t('OPEN_PDF_SETTINGS_NAME'), 'pdfAppPath', ['exe', 'app'], deviceSettings);
		this.addPathSetting(t('OPEN_BROWSER_SETTINGS_NAME'), 'browserAppPath', ['exe', 'app'], deviceSettings);

		// Setting for Zotero database location
		new Setting(containerEl)
			.setName(t('ZOTERO_DATABASE_LOCATION'))
			.setDesc(t('SELECT_ZOTERO_DATABASE_FOLDER'))
			.addButton(button => button
				.setButtonText(t('SELECT_FOLDER'))
				.onClick(async () => {
					const dirPath = await pickPath(true);
					if (dirPath) {
						deviceSettings.zoteroDatabaseDir = dirPath;
						deviceSettings.zoteroDatabaseSqlFile = path.join(dirPath, "zotero.sqlite");
						await this.plugin.saveSettings();
						this.display();
					}
				}))
			.addText(text => text
				.setPlaceholder('未选择路径')
				.setValue(deviceSettings.zoteroDatabaseDir)
				.setDisabled(true));

		// Setting for excluded file extensions
		new Setting(containerEl)
			.setName(t('EXCLUDED_FILE_EXTENSIONS'))
			.setDesc(t('EXCLUDED_FILE_EXTENSIONS_DESC'))
			.addText(text => text
				.setPlaceholder('html, png (examples)')
				.setValue(this.plugin.settings.excludedExtensions.join(', '))
				.onChange(async (value) => {
					this.plugin.settings.excludedExtensions = value.split(',').map(s => s.trim().toLowerCase());
					await this.plugin.saveSettings();
				}));

		return;
	}

	// Axiliary function to add path setting
	addPathSetting(name: string, settingKey: keyof DeviceSpecificSettings, exts: string[], deviceSettings: DeviceSpecificSettings) {
		new Setting(this.containerEl)
			.setName(`${name}`)
			.setDesc(t('OPEN_FILE_DESC'))
			.addButton(btn => btn
				.setButtonText(t('EXPLORE_FILE'))
				.onClick(async () => {
					const path = await window.electron.remote.dialog.showOpenDialog({
						properties: ['openFile']
					}) as { canceled: boolean; filePaths: string[] };
					if (!path.canceled) {
						(deviceSettings[settingKey]) = path.filePaths[0] as string;
						await this.plugin.saveSettings();
						this.display();
					}
				}))
			.addText(text => text
				.setValue((deviceSettings)[settingKey])
				.setPlaceholder(t('USE_DEFAULT_APP'))
				.onChange(async (val) => {
					(deviceSettings[settingKey]) = val;
					await this.plugin.saveSettings();
				}));
	}
}