import { App, PluginSettingTab, Setting } from "obsidian";
import ZoteroCitePDFPlugin from "./main";
// eslint-disable-next-line import/no-nodejs-modules
import path from "node:path";

// 声明 Electron 接口防止报错
// 定义返回结果的结构
interface OpenDialogReturnValue {
    canceled: boolean;
    filePaths: string[];
}

// 定义配置项的结构 (这里列举常用项)
interface OpenDialogOptions {
    title?: string;
    defaultPath?: string;
    buttonLabel?: string;
    filters?: { name: string; extensions: string[] }[];
    properties?: Array<'openFile' | 'openDirectory' | 'multiSelections' | 'showHiddenFiles'>;
}

declare global {
    interface Window {
        electron: {
            remote: {
                dialog: {
                    // 使用具体的类型代替 any
                    showOpenDialog(options: OpenDialogOptions): Promise<OpenDialogReturnValue>;
                };
            };
        };
    }
}
export interface ZoteroCitePDFPluginSettings {
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
			}) as { canceled: boolean; filePaths: string[] };

			if (result.canceled || result.filePaths.length === 0) {
				return null;
			}

			return result.filePaths[0] as string;
		} catch (error) {
			console.error("手动选择路径失败:", error);
			// 可以加一个 Obsidian 的 Notice 提醒用户
			// new Notice("无法打开文件选择器");
			return null;
		}
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// 辅助函数：调用系统文件选择器
		const pickPath = async (isFolder: boolean, extensions?: string[]) => {

			const result = await window.electron.remote.dialog.showOpenDialog({
				properties: [isFolder ? 'openDirectory' : 'openFile'],
				filters: extensions ? [{ name: 'Allowed Files', extensions }] : []
			}) as { canceled: boolean; filePaths: string[] };
			return result.canceled ? null : result.filePaths[0] as string;
		};

		// new Setting(containerEl).setName('插件设置').setDesc('配置 Zotero Cite PDF 插件的各项参数');
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
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			.setDesc('不参与搜索的文件后缀 (如: html, png)')
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

	// 封装一个通用的路径选择 Setting 项
	addPathSetting(name: string, settingKey: keyof ZoteroCitePDFPluginSettings, exts: string[]) {
		new Setting(this.containerEl)
			.setName(`${name}路径`)
			.setDesc(`指定用于打开文件的${name}程序`)
			.addButton(btn => btn
				.setButtonText("浏览")
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
				.setPlaceholder('使用系统默认程序')
				.onChange(async (val) => {
					(this.plugin.settings[settingKey] as string) = val;
					await this.plugin.saveSettings();
				}));
	}
}