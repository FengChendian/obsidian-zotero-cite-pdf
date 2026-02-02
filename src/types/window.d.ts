// Declare additional types for the Window interface to include Electron's dialog module
interface OpenDialogReturnValue {
    canceled: boolean;
    filePaths: string[];
}

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
                showOpenDialog(options: OpenDialogOptions): Promise<OpenDialogReturnValue>;
            };
        };
    };
}
