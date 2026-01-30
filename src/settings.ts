import { App, PluginSettingTab, Setting, ButtonComponent } from "obsidian";
import MyPlugin from "./main";
import path from "path";

// 声明 Electron 接口防止报错
declare global {
	interface Window {
		electron: any;
	}
}

export interface MyPluginSettings {
	mySetting: string;
	// 1. 默认打开程序路径
	pdfAppPath: string;
	browserAppPath: string;
	// 2. Zotero 数据库路径
	zoteroDatabaseDir: string;
	zoteroDatabaseSqlFile: string;
	// 3. 排除的文件类型 (使用数组存储)
	excludedExtensions: string[];
}

export const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: 'default',
	pdfAppPath: '',
	browserAppPath: '',
	zoteroDatabaseDir: '',
	zoteroDatabaseSqlFile: '',
	excludedExtensions: []
}
export class ZoteroCiteSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}
	async pickManualPath(): Promise<string | null> {
		const isWin = window.process.platform === 'win32';

		// 根据系统定义过滤器
		// Windows 找 .exe 或 .bat，Mac 找 .app
		const filters = isWin
			? [{ name: '可执行文件', extensions: ['exe', 'bat', 'cmd'] }]
			: [{ name: '应用程序', extensions: ['app'] }];

		try {
			// 调用 Electron 原生选择框
			const result = await window.electron.remote.dialog.showOpenDialog({
				title: '请手动选择应用程序',
				properties: ['openFile'],
				filters: filters
			});

			if (result.canceled || result.filePaths.length === 0) {
				return null;
			}

			return result.filePaths[0];
		} catch (error) {
			console.error("手动选择路径失败:", error);
			// 可以加一个 Obsidian 的 Notice 提醒用户
			// new Notice("无法打开文件选择器");
			return null;
		}
	}

	async display(): Promise<void> {
		const { containerEl } = this;
		containerEl.empty();

		// 辅助函数：调用系统文件选择器
		const pickPath = async (isFolder: boolean, extensions?: string[]) => {
			const result = await window.electron.remote.dialog.showOpenDialog({
				properties: [isFolder ? 'openDirectory' : 'openFile'],
				filters: extensions ? [{ name: 'Allowed Files', extensions }] : []
			});
			return result.canceled ? null : result.filePaths[0];
		};

		containerEl.createEl('h2', { text: 'Zotero Cite PDF Settings' });

		// --- 1. 应用程序路径选择 ---
		this.addPathSetting('PDF阅读器', 'pdfAppPath', ['exe', 'app']);
		this.addPathSetting('浏览器', 'browserAppPath', ['exe', 'app']);

		// --- 2. Zotero 数据库选择 (限定 .sqlite) ---
		new Setting(containerEl)
			.setName('Zotero数据库位置')
			.setDesc('选择存储库的位置')
			.addButton(button => button
				.setButtonText("选择文件夹")
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

		// --- 3. 排除文件类型 (保持手动输入，因为这更像标签管理) ---
		new Setting(containerEl)
			.setName('排除的文件后缀')
			.setDesc('不参与搜索的文件后缀 (如: html, png)')
			.addText(text => text
				.setPlaceholder('html, png (examples)')
				.setValue(this.plugin.settings.excludedExtensions.join(', '))
				.onChange(async (value) => {
					this.plugin.settings.excludedExtensions = value.split(',').map(s => s.trim().toLowerCase());
					await this.plugin.saveSettings();
				}));
	}

	// 封装一个通用的路径选择 Setting 项
	addPathSetting(name: string, settingKey: keyof MyPluginSettings, exts: string[]) {
		new Setting(this.containerEl)
			.setName(`${name}路径`)
			.setDesc(`指定用于打开文件的${name}程序`)
			.addButton(btn => btn
				.setButtonText("浏览")
				.onClick(async () => {
					const path = await window.electron.remote.dialog.showOpenDialog({
						properties: ['openFile']
					});
					if (!path.canceled) {
						(this.plugin.settings as any)[settingKey] = path.filePaths[0];
						await this.plugin.saveSettings();
						this.display();
					}
				}))
			.addText(text => text
				.setValue((this.plugin.settings as any)[settingKey] as string)
				.setPlaceholder('使用系统默认程序')
				.onChange(async (val) => {
					(this.plugin.settings as any)[settingKey] = val;
					await this.plugin.saveSettings();
				}));
	}
}