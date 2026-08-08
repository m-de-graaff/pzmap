import { parseLivePayload } from './protocol.js';
import type { LivePayload } from './protocol.js';

export interface FileWatcherHandlers {
  onPayload: (payload: LivePayload) => void;
  onStatus: (status: 'reading' | 'error', message?: string) => void;
}

export function startFileWatching(
  readFile: () => Promise<string>,
  intervalMs: number,
  { onPayload, onStatus }: FileWatcherHandlers,
): () => void {
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    try {
      const text = await readFile();
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
