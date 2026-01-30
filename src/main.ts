import { Editor, MarkdownView, Notice, Plugin, ObsidianProtocolData } from 'obsidian';
import { DEFAULT_SETTINGS, MyPluginSettings, ZoteroCiteSettingTab } from "./settings";
import * as fs from 'fs';
import initSqlJs, { Database } from "sql.js";
import open from 'open';
import { ZoteroSearchModal } from 'search-modal';

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;
	db: Database;

	async onload() {
		await this.loadSettings();


		// This creates an icon in the left ribbon.
		this.addRibbonIcon('library', 'Zotero Search Literature', async (evt: MouseEvent) => {
			// Called when the user clicks the icon.
			// new Notice('This is a notice!');
			await this.tryInitZoteroDatabase(this.settings.zoteroDatabaseSqlFile);
			new ZoteroSearchModal(this.app, this.db, this.settings.zoteroDatabaseDir, this.settings.excludedExtensions).open();
		});

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText('Zotero Cite PDF');

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'open-zotero-search',
			name: 'Search Zotero Literature',
			// 仅在编辑器视图下可用
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				// 假设你已经把加载好的 db 存到了 this.db
				await this.tryInitZoteroDatabase(this.settings.zoteroDatabaseSqlFile);
				new ZoteroSearchModal(this.app, this.db, this.settings.zoteroDatabaseDir, this.settings.excludedExtensions).open();
			}
		});
		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new ZoteroCiteSettingTab(this.app, this));


		this.registerObsidianProtocolHandler("zotero-cite-pdf", async (params: ObsidianProtocolData) => {
			// params 包含了 URL 中的所有查询参数

			const fullPath = params.fullPath;
			const type = params.type;
			if (!fullPath) return;

			// 处理 fullPath，可能需要解码
			// const decodedPath = decodeURIComponent(fullPath as string);

			// 使用系统默认应用打开 PDF 文件
			// console.log("打开 PDF 文件路径:", decodedPath);
			if (type === 'PDF') {
				// 用用户指定的应用打开 PDF
				await open(
					fullPath,
					{ app: { name: this.settings.pdfAppPath } }
				);
			}
			else {
				// 用用户指定的浏览器打开链接
				await
					open(
						fullPath,
						{ app: { name: this.settings.browserAppPath } }
					)
			}

		});

	}

	async searchZotero(keyword: string, zoteroDataDir: string) {
		const sql = `
        SELECT 
            p.key, 
            v.value AS title, 
            att.path
        FROM items p
        JOIN itemData d ON p.itemID = d.itemID
        JOIN fields f ON d.fieldID = f.fieldID AND f.fieldName = 'title'
        JOIN itemDataValues v ON d.valueID = v.valueID
        LEFT JOIN itemAttachments att ON p.itemID = att.parentItemID
        WHERE v.value LIKE ? 
          AND p.itemID NOT IN (SELECT itemID FROM deletedItems)
    `;

		// 使用 %keyword% 进行模糊匹配
		const results = this.db.exec(sql, [`%${keyword}%`]);

		if (results.length === 0 || !results || !results[0]) return [];

		return results[0].values.map(row => {
			const itemKey = row[0];
			const title = row[1];
			let fullPath = null;

			if (row[2]) {
				// Zotero 内部路径格式通常为 "storage:Paper.pdf"
				const fileName = String(row[2]).replace(/^storage:/, '');
				// 最终物理路径: 数据目录/storage/条目Key/文件名
				fullPath = `${zoteroDataDir}/storage/${itemKey}/${fileName}`;
			}

			return { title, fullPath, key: itemKey };
		});
	}

	async handleProtocolCall(title: string, content?: string) {
		// 在这里编写你的逻辑，例如创建新笔记或弹窗提醒
		console.log(`收到协议请求！标题: ${title}, 内容: ${content}`);

		new Notice(`自定义协议已触发：${title}`);
	}

	async tryInitZoteroDatabase(absolutePath: string) {

		if (!this.db) {
			this.db = await this.loadDatabase(absolutePath);
			try {
				// 某些版本的 SQLite 环境支持 query_only
				this.db.run("PRAGMA query_only = ON;");
			} catch (e) {
				console.warn("PRAGMA query_only not supported, falling back to manual read-only logic.");
			}
		}

		// console.log("成功打开外部数据库");
	}

	async loadDatabase(absolutePath: string): Promise<Database> {
		// 获取插件所在目录的路径
		const pluginPath = this.manifest.dir;
		const wasmPath = `${pluginPath}/sql-wasm.wasm`;

		// 使用 Obsidian 的 adapter 读取本地文件二进制
		const wasmBuffer = await this.app.vault.adapter.readBinary(wasmPath);

		const SQL = await initSqlJs({
			wasmBinary: wasmBuffer
		});
		const fileBuffer = fs.readFileSync(absolutePath);
		return new SQL.Database(new Uint8Array(fileBuffer));
	}


	onunload() {
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<MyPluginSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
