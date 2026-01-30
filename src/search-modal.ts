import { App, SuggestModal, MarkdownView, Notice } from "obsidian";
// eslint-disable-next-line import/no-nodejs-modules
import path from "node:path";
import { Database } from "sql.js";

interface ZoteroItem {
    key: string;
    title: string;
    fullPath: string | null;
    type: string; // 用于 UI 分类：'PDF', 'Web', 'Other'
}

export class ZoteroSearchModal extends SuggestModal<ZoteroItem> {
    db: Database; // 传入你已经加载好的 SQL.Database
    zoteroDataDir: string;
    excludedExtensions: string[];

    constructor(app: App, db: Database, zoteroDataDir: string, excludedExtensions: string[]) {
        super(app);
        this.db = db;
        this.zoteroDataDir = zoteroDataDir;
        this.excludedExtensions = excludedExtensions;
        this.setPlaceholder("输入文献标题进行模糊搜索...");
    }

    // 根据输入执行 SQL 查询
    getSuggestions(query: string): ZoteroItem[] {
        if (query.length < 2) return []; // 避免输入太短时触发大量计算

        const sql = `
            SELECT 
                items.key AS itemKey,              -- 主条目的 Key
                itemDataValues.value AS title, 
                attachmentItems.key AS attachmentKey, -- 附件条目自己的 Key (关键！)
                itemAttachments.path AS pdfPath,
                itemAttachments.contentType
            FROM items
            JOIN itemData ON items.itemID = itemData.itemID
            JOIN fields ON itemData.fieldID = fields.fieldID AND fields.fieldName = 'title'
            JOIN itemDataValues ON itemData.valueID = itemDataValues.valueID
            -- 重点：通过 itemAttachments 找到附件的 itemID，再反向连回 items 表拿附件的 Key
            LEFT JOIN itemAttachments ON items.itemID = itemAttachments.parentItemID
            LEFT JOIN items AS attachmentItems ON itemAttachments.itemID = attachmentItems.itemID
            WHERE itemDataValues.value LIKE ? 
            AND items.itemID NOT IN (SELECT itemID FROM deletedItems)
            AND itemAttachments.path IS NOT NULL       -- 路径不能为空
            LIMIT 30;
        `;

        const results = this.db.exec(sql, [`%${query}%`]);
        if (results.length === 0 || !results[0]) return [];
        // console.log("SQL 查询结果:", results);
        return results[0].values.map((row: string[]) => {
            const itemKey = row[0] || "";       // 主条目 Key
            const title = row[1] || "";
            const attachKey = row[2];     // 附件自己的 Key (例如 UQPBFB3K)

            const rawPath = row[3] || "";
            const contentType = row[4] || "";
            if (!attachKey || !rawPath) {
                // 如果没有附件 Key 或路径，说明没有 PDF 附件
                // new Notice(`条目 "${title}" 没有找到 PDF 附件`);
                return {
                    key: itemKey,
                    title: title,
                    fullPath: null,
                    type: "Other"
                };
            }

            const fullPath = path.join(this.zoteroDataDir, "storage", attachKey, rawPath.replace(/^storage:/, ""));
            // 更精细的类型判断
            let type = "File";
            if (contentType.includes("pdf")) type = "PDF";
            else if (contentType.includes("html")) type = "HTML";
            else if (rawPath.endsWith(".epub")) type = "EPUB";

            return {
                key: itemKey,
                title: title,
                fullPath: fullPath,
                type: type
            };
        }).filter((item: ZoteroItem) => {
            // --- 核心过滤逻辑 ---
            if (!item.fullPath) return false; // 如果没有附件，不保留条目

            // 获取后缀名（例如从 "paper.png" 得到 "png"）
            const fileExt = path.extname(item.fullPath).toLowerCase().replace('.', '');

            // 如果后缀在排除列表中，则过滤掉（返回 false）
            const isExcluded = this.excludedExtensions.some(ext => ext.toLowerCase().trim() === fileExt);

            return !isExcluded;
        });
    }

    // 渲染下拉列表的每一行
    renderSuggestion(item: ZoteroItem, el: HTMLElement) {
        const container = el.createEl("div", { cls: "zotero-cite-pdf-result-item" });

        // 直接创建，不赋值给变量
        container.createEl("span", {
            text: item.type,
            cls: `zotero-cite-pdf-tag tag-${item.type.toLowerCase().replace(/\s+/g, '-')}`
        });

        container.createEl("span", { text: item.title, cls: "zotero-cite-pdf-title" });

        container.createEl("small", { text: ` [${item.key}]`, cls: "zotero-cite-pdf-key" });
    }

    // 用户点击某一项后的动作
    onChooseSuggestion(item: ZoteroItem, evt: MouseEvent | KeyboardEvent) {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;

        // const cursor = view.editor.getCursor();

        // 1. 处理路径：去掉 storage: 前缀并编码
        if (!item.fullPath) {
            new Notice(`条目 "${item.title}" 没有找到 PDF 附件`);
            return;
        };
        // const cleanPath = item.pdfPath.replace(/^storage:/, '');
        // 如果是相对路径，拼凑成完整路径（可选，取决于你的协议处理器如何处理）
        const finalPath = encodeURIComponent(item.fullPath);

        // 2. 构建自定义协议链接
        // 格式：[{title}](obsidian://cite-zotero-pdf?fullPath={fullPath}&type={type})
        const link = `[${item.title}](obsidian://zotero-cite-pdf?fullPath=${finalPath}&type=${item.type})`;

        // 3. 插入到编辑器
        view.editor.replaceSelection(link);
    }
}