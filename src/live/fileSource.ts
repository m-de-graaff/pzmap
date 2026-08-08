import { parseLivePayload } from './protocol';
import type { LivePayload } from './protocol';

export type LiveSourceStatus = 'idle' | 'reading' | 'error';

export interface LiveFileSourceHandlers {
  onPayload: (payload: LivePayload) => void;
  onStatus: (status: LiveSourceStatus, message?: string) => void;
}

export async function pickLiveFile(): Promise<FileSystemFileHandle | null> {
  try {
    const [handle] = await window.showOpenFilePicker({
      types: [{ description: 'pzmap Live file', accept: { 'application/json': ['.json'] } }],
      excludeAcceptAllOption: false,
    });
    return handle;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return null;
    throw err;
  }
}

export function startPolling(
  handle: FileSystemFileHandle,
  intervalMs: number,
  { onPayload, onStatus }: LiveFileSourceHandlers,
): () => void {
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    try {
      const file = await handle.getFile();
      const text = await file.text();
      const payload = parseLivePayload(JSON.parse(text));
      if (!payload) {
        onStatus('error', 'File does not match the pzmap Live format.');
        return;
      }
      onStatus('reading');
      onPayload(payload);
    } catch (err) {
      onStatus('error', err instanceof Error ? err.message : 'Failed to read live file.');
    }
  };

  const id = setInterval(tick, intervalMs);
  return () => {
    stopped = true;
    clearInterval(id);
  };
}
