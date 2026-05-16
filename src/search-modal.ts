import { App, SuggestModal, MarkdownView, Notice } from "obsidian";
import path from "node:path";
import initSqlJs, { Database, type SqlValue } from "sql.js";
import { t } from "./lang/lang-helper";
import fs from 'node:fs';
import wasmBinary from "../node_modules/sql.js/dist/sql-wasm.wasm";

interface ZoteroItem {
    key: string;
    title: string;
    fullPath: string | null;
    type: string;
}

export class ZoteroSearchModal extends SuggestModal<ZoteroItem> {
    db: Database | null = null;
    // zoteroDataDir: string;
    databaseAbsolutePath: string
    excludedExtensions: string[];
    lastModifiedTime: number = 0;
    sql = `
            SELECT 
                items.key AS itemKey,    
                itemDataValues.value AS title, 
                attachmentItems.key AS attachmentKey, 
                itemAttachments.path AS pdfPath,
                itemAttachments.contentType
            FROM items
            JOIN itemData ON items.itemID = itemData.itemID
            JOIN fields ON itemData.fieldID = fields.fieldID AND fields.fieldName = 'title'
            JOIN itemDataValues ON itemData.valueID = itemDataValues.valueID
            LEFT JOIN itemAttachments ON items.itemID = itemAttachments.parentItemID
            LEFT JOIN items AS attachmentItems ON itemAttachments.itemID = attachmentItems.itemID
            WHERE itemDataValues.value LIKE ? 
            AND items.itemID NOT IN (SELECT itemID FROM deletedItems)
            AND itemAttachments.path IS NOT NULL
            LIMIT 30;
        `;

    constructor(app: App, databaseAbsolutePath: string, excludedExtensions: string[]) {
        super(app);
        // this.zoteroDataDir = zoteroDataDir;
        this.databaseAbsolutePath = databaseAbsolutePath;
        this.excludedExtensions = excludedExtensions;
        this.setPlaceholder(t('SEARCH_MODAL_DESCRIPTION'));
    }

    async tryInitZoteroDatabase(absolutePath: string) {
        const stats = fs.statSync(absolutePath);
        const currentModifiedTime = stats.mtimeMs;

        if (!this.db || this.lastModifiedTime !== currentModifiedTime) {
            if (this.db) {
                this.db.close();
            }

            this.db = await this.loadDatabase(absolutePath);
            this.lastModifiedTime = currentModifiedTime;

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

    // According to the query, return matching Zotero items
    async getSuggestions(query: string): Promise<ZoteroItem[]> {
        // Avoid querying for very short strings
        if (query.length < 2) return [];

        await this.tryInitZoteroDatabase(this.databaseAbsolutePath);

        if (!this.db) {
            return [];
        }

        const results = this.db.exec(this.sql, [`%${query}%`]);

        if (results.length === 0 || !results[0]) return [];

        return results[0].values.map((row: SqlValue[]) => {
            const itemKey = String(row[0] ?? "");
            const title = String(row[1] ?? "");
            const attachKey: string | null = row[2] ? String(row[2]) : null;

            const rawPath = String(row[3] ?? "");
            const contentType = String(row[4] ?? "");
            if (!attachKey || !rawPath) {
                // If there is no attachment key or path, it means there is no PDF attachment

                return {
                    key: itemKey,
                    title: title,
                    fullPath: null,
                    type: "Other"
                };
            }

            const fullPath = path.join("storage", attachKey, rawPath.replace(/^storage:/, "")).replace(/\\/g, '/');

            let type = "File";
            if (contentType.includes("pdf")) type = "PDF";
            else if (contentType.includes("html")) type = "HTML";
            else if (rawPath.endsWith(".epub")) type = "EPUB";
            else type = "Other";

            return {
                key: itemKey,
                title: title,
                fullPath: fullPath,
                type: type
            };
        }).filter((item: ZoteroItem) => {

            if (!item.fullPath) return false; // if no attachment, skip

            // Get the file extension in lowercase without the dot
            const fileExt = path.extname(item.fullPath).toLowerCase().replace('.', '');

            // If the file extension is in the excluded list, skip this item
            const isExcluded = this.excludedExtensions.some(ext => ext.toLowerCase().trim() === fileExt);

            return !isExcluded;
        });
    }

    // Render each row in the dropdown list
    renderSuggestion(item: ZoteroItem, el: HTMLElement) {
        const container = el.createEl("div", { cls: "zotero-cite-pdf-result-item" });

        container.createEl("span", {
            text: item.type,
            cls: `zotero-cite-pdf-tag tag-${item.type.toLowerCase().replace(/\s+/g, '-')}`
        });

        container.createEl("span", { text: item.title, cls: "zotero-cite-pdf-title" });

        container.createEl("small", { text: ` [${item.key}]`, cls: "zotero-cite-pdf-key" });
    }

    // Handle selection of a suggestion
    onChooseSuggestion(item: ZoteroItem, evt: MouseEvent | KeyboardEvent) {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;

        if (!item.fullPath) {
            new Notice(`Item "${item.title}" does not have a PDF attachment`);
            return;
        };

        // Ensure the fullPath is properly encoded for URL usage
        const finalPath = encodeURIComponent(item.fullPath);


        // Format: [{title}](obsidian://zotero-cite-pdf?fullPath={fullPath}&type={type})
        const link = `[${item.title}](obsidian://zotero-cite-pdf?fullPath=${finalPath}&type=${item.type})`;

        // Insert into editor
        view.editor.replaceSelection(link);
    }
}