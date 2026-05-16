import { getLanguage } from "obsidian";
import en from "./en";
import zhCn from "./zh-cn";

// 建立语言映射表
// Construct a language mapping table
const localeMap: { [k: string]: Partial<typeof en> } = {
    en: en,
    "zh": zhCn,
};

/**
 * 核心翻译函数
 * Core translation function
 * @param str en.ts 中定义的键名 / Key name defined in en.ts
 * @returns 对应语言的文本，若缺失则返回英文，若英文也缺失则返回键名 / Corresponding language text, if missing return English, if English is also missing return the key name
 */
export function t(str: keyof typeof en): string {
    // 获取 Obsidian 界面当前的语言设置 / Get the current language setting of the Obsidian interface
    // getLanguage() 返回格式通常为 "en", "zh-cn" 等
    const locale = getLanguage(); 
    // 注意：官方 API 在某些环境中可能通过以下方式获取
    // Note: The official API may obtain it in some environments as follows
    const currentLang: string = (window.app).getLanguage?.() || locale;

    const lang = localeMap[currentLang] || localeMap["en"];
    
    return (lang && lang[str]) || en[str] || str;
}