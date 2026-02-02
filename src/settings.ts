import { App, PluginSettingTab, Setting } from "obsidian";
import ZoteroCitePDFPlugin from "./main";
import path from "node:path";
import { t } from "./lang/lang-helper";


export interface ZoteroCitePDFPluginSettings {
	mySetting: string;
	pdfAppPath: string;
	browserAppPath: string;
	zoteroDatabaseDir: string;
	zoteroDatabaseSqlFile: string;
	excludedExtensions: string[];
}

export const DEFAULT_SETTINGS: ZoteroCitePDFPluginSettings = {
	mySetting: 'default',
	pdfAppPath: '',
	browserAppPath: '',
	zoteroDatabaseDir: '',
	zoteroDatabaseSqlFile: '',
	excludedExtensions: []
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
			? [{ name: '可执行文件', extensions: ['exe', 'bat', 'cmd'] }]
			: [{ name: '应用程序', extensions: ['app'] }];

		try {
			// 调用 Electron 原生选择框
			const result = await window.electron.remote.dialog.showOpenDialog({
				title: '请手动选择应用程序',
				properties: ['openFile'],
				filters: filters
			}) as { canceled: boolean; filePaths: string[] };

			if (result.canceled || result.filePaths.length === 0) {
				return null;
			}

			return result.filePaths[0] as string;
		} catch (error) {
			console.error("手动选择路径失败:", error);
			return null;
		}
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// Axiliary function to pick file or folder path
		const pickPath = async (isFolder: boolean, extensions?: string[]) => {

			const result = await window.electron.remote.dialog.showOpenDialog({
				properties: [isFolder ? 'openDirectory' : 'openFile'],
				filters: extensions ? [{ name: 'Allowed Files', extensions }] : []
			}) as { canceled: boolean; filePaths: string[] };
			return result.canceled ? null : result.filePaths[0] as string;
		};

		this.addPathSetting(t('OPEN_PDF_SETTINGS_NAME'), 'pdfAppPath', ['exe', 'app']);
		this.addPathSetting(t('OPEN_BROWSER_SETTINGS_NAME'), 'browserAppPath', ['exe', 'app']);

		// Setting for Zotero database location
		new Setting(containerEl)
			.setName(t('ZOTERO_DATABASE_LOCATION'))
			.setDesc(t('SELECT_ZOTERO_DATABASE_FOLDER'))
			.addButton(button => button
				.setButtonText(t('SELECT_FOLDER'))
				.onClick(async () => {
					const dirPath = await pickPath(true);
					if (dirPath) {
						this.plugin.settings.zoteroDatabaseDir = dirPath;
						this.plugin.settings.zoteroDatabaseSqlFile = path.join(dirPath, "zotero.sqlite");
						await this.plugin.saveSettings();
						this.display(); // 刷新页面显示新路径
					}
				}))
			.addText(text => text
				.setPlaceholder('未选择路径')
				.setValue(this.plugin.settings.zoteroDatabaseDir)
				.setDisabled(true)); // 禁用手动输入，防止出错

		// Setting for excluded file extensions
		new Setting(containerEl)
			.setName(t('EXCLUDED_FILE_EXTENSIONS'))
			.setDesc(t('EXCLUDED_FILE_EXTENSIONS_DESC'))
			.addText(text => text
				// eslint-disable-next-line obsidianmd/ui/sentence-case
				.setPlaceholder('html, png (examples)')
				.setValue(this.plugin.settings.excludedExtensions.join(', '))
				.onChange(async (value) => {
					this.plugin.settings.excludedExtensions = value.split(',').map(s => s.trim().toLowerCase());
					await this.plugin.saveSettings();
				}));

		return;
	}

	// Axiliary function to add path setting
	addPathSetting(name: string, settingKey: keyof ZoteroCitePDFPluginSettings, exts: string[]) {
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
						(this.plugin.settings[settingKey] as string) = path.filePaths[0] as string;
						await this.plugin.saveSettings();
						this.display();
					}
				}))
			.addText(text => text
				.setValue((this.plugin.settings)[settingKey] as string)
				.setPlaceholder(t('USE_DEFAULT_APP'))
				.onChange(async (val) => {
					(this.plugin.settings[settingKey] as string) = val;
					await this.plugin.saveSettings();
				}));
	}
}