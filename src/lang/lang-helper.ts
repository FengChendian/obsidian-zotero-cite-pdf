import en from "./en";
import zhCn from "./zh-cn";

// 1. 建立语言映射表
const localeMap: { [k: string]: Partial<typeof en> } = {
    en: en,
    "zh": zhCn,
};

/**
 * 核心翻译函数
 * @param str en.ts 中定义的键名
 * @returns 对应语言的文本，若缺失则返回英文，若英文也缺失则返回键名
 */
export function t(str: keyof typeof en): string {
    // 2. 获取 Obsidian 界面当前的语言设置
    // getLanguage() 返回格式通常为 "en", "zh-cn" 等
    const locale = window.localStorage.getItem('language') || "en"; 
    // console.log("当前语言:", locale);
    // 注意：官方 API 在某些环境中可能通过以下方式获取
    // @ts-ignore
    const currentLang: string = (window.app).getLanguage?.() || locale;

    const lang = localeMap[currentLang] || localeMap["en"];
    
    return (lang && lang[str]) || en[str] || str;
}