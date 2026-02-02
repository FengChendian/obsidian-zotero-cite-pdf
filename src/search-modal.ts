import { App, SuggestModal, MarkdownView, Notice } from "obsidian";
import path from "node:path";
import { Database } from "sql.js";
import { t } from "./lang/lang-helper";

interface ZoteroItem {
    key: string;
    title: string;
    fullPath: string | null;
    type: string;
}

export class ZoteroSearchModal extends SuggestModal<ZoteroItem> {
    db: Database;
    zoteroDataDir: string;
    excludedExtensions: string[];

    constructor(app: App, db: Database, zoteroDataDir: string, excludedExtensions: string[]) {
        super(app);
        this.db = db;
        this.zoteroDataDir = zoteroDataDir;
        this.excludedExtensions = excludedExtensions;
        this.setPlaceholder(t('SEARCH_MODAL_DESCRIPTION'));
    }

    // According to the query, return matching Zotero items
    getSuggestions(query: string): ZoteroItem[] {
        // Avoid querying for very short strings
        if (query.length < 2) return [];

        const sql = `
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

        const results = this.db.exec(sql, [`%${query}%`]);
        if (results.length === 0 || !results[0]) return [];

        return results[0].values.map((row: string[]) => {
            const itemKey = row[0] || "";       // Main item Key
            const title = row[1] || "";
            const attachKey = row[2];     // Attachment's own Key (e.g., UQPBFB3K)

            const rawPath = row[3] || "";
            const contentType = row[4] || "";
            if (!attachKey || !rawPath) {
                // If there is no attachment key or path, it means there is no PDF attachment

                return {
                    key: itemKey,
                    title: title,
                    fullPath: null,
                    type: "Other"
                };
            }

            const fullPath = path.join(this.zoteroDataDir, "storage", attachKey, rawPath.replace(/^storage:/, ""));

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