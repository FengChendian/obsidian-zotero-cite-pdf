import { Editor, MarkdownView, Plugin, ObsidianProtocolData } from 'obsidian';
import { DEFAULT_SETTINGS, ZoteroCitePDFPluginSettings, ZoteroCiteSettingTab } from "./settings";
import fs from 'node:fs';
import initSqlJs, { Database } from "sql.js";
import open from 'open';
import { ZoteroSearchModal } from 'search-modal';
import wasmBinary from "../node_modules/sql.js/dist/sql-wasm.wasm";

export default class ZoteroCitePDFPlugin extends Plugin {
	settings: ZoteroCitePDFPluginSettings;
	db: Database;

	async onload() {
		await this.loadSettings();


		// This creates an icon in the left ribbon.
		this.addRibbonIcon('library', 'Search literature', async (evt: MouseEvent) => {
			// Called when the user clicks the icon.
			await this.tryInitZoteroDatabase(this.settings.zoteroDatabaseSqlFile);
			new ZoteroSearchModal(this.app, this.db, this.settings.zoteroDatabaseDir, this.settings.excludedExtensions).open();
		});

		// This adds a open command that can be triggered anywhere
		this.addCommand({
			id: 'open-zotero-search',
			name: 'Search Zotero literature',

			editorCallback: async (editor: Editor, view: MarkdownView) => {
				// try initialize the database if not already done
				await this.tryInitZoteroDatabase(this.settings.zoteroDatabaseSqlFile);
				new ZoteroSearchModal(this.app, this.db, this.settings.zoteroDatabaseDir, this.settings.excludedExtensions).open();
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new ZoteroCiteSettingTab(this.app, this));

		// Register Obsidian protocol handler for zotero-cite-pdf
		this.registerObsidianProtocolHandler("zotero-cite-pdf", async (params: ObsidianProtocolData) => {
			const fullPath = params.fullPath;
			const type = params.type;
			if (!fullPath) return;

			if (type === 'PDF') {
				await open(
					fullPath,
					{ app: { name: this.settings.pdfAppPath } }
				);
			}
			// open with browser for non-PDF types
			else {
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
		// Use %keyword% for fuzzy matching
		const results = this.db.exec(sql, [`%${keyword}%`]);

		if (results.length === 0 || !results || !results[0]) return [];

		return results[0].values.map(row => {
			const itemKey = row[0] as string;
			const title = row[1];
			let fullPath = null;

			if (row[2] && itemKey) {
				const fileName = String(row[2]).replace(/^storage:/, '');
				fullPath = `${zoteroDataDir}/storage/${itemKey}/${fileName}`;
			}

			return { title, fullPath, key: itemKey };
		});
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
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<ZoteroCitePDFPluginSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
