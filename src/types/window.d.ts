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
interface Window {
    app: {
        getLanguage?: () => string;
    };
    electron: {
        remote: {
            dialog: {
                // 使用具体的类型代替 any
                showOpenDialog(options: OpenDialogOptions): Promise<OpenDialogReturnValue>;
            };
        };
    };
}
