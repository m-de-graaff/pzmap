/// <reference types="vite/client" />

type FileSystemPermissionMode = 'read' | 'readwrite';

interface FileSystemFileHandle {
  getFile(): Promise<File>;
  queryPermission(opts?: { mode?: FileSystemPermissionMode }): Promise<PermissionState>;
  requestPermission(opts?: { mode?: FileSystemPermissionMode }): Promise<PermissionState>;
}

interface OpenFilePickerOptions {
  types?: { description: string; accept: Record<string, string[]> }[];
  excludeAcceptAllOption?: boolean;
}

interface Window {
  showOpenFilePicker(options?: OpenFilePickerOptions): Promise<FileSystemFileHandle[]>;
}
