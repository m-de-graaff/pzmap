/// <reference types="vite/client" />

interface FileSystemFileHandle {
  getFile(): Promise<File>;
}

interface OpenFilePickerOptions {
  types?: { description: string; accept: Record<string, string[]> }[];
  excludeAcceptAllOption?: boolean;
}

interface Window {
  showOpenFilePicker(options?: OpenFilePickerOptions): Promise<FileSystemFileHandle[]>;
}
