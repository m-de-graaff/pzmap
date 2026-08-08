import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startFileWatching } from './fileWatcher.js';
import { LIVE_PROTOCOL_VERSION } from './protocol.js';

describe('startFileWatching', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('reads on an interval and reports valid payloads', async () => {
    const payload = { v: LIVE_PROTOCOL_VERSION, players: [] };
    const readFile = vi.fn().mockResolvedValue(JSON.stringify(payload));
    const onPayload = vi.fn();
    const onStatus = vi.fn();

    const stop = startFileWatching(readFile, 1000, { onPayload, onStatus });
    await vi.advanceTimersByTimeAsync(1000);
    expect(onPayload).toHaveBeenCalledWith(payload);
    expect(onStatus).toHaveBeenCalledWith('reading');

    await vi.advanceTimersByTimeAsync(1000);
    expect(readFile).toHaveBeenCalledTimes(2);

    stop();
    await vi.advanceTimersByTimeAsync(2000);
    expect(readFile).toHaveBeenCalledTimes(2);
  });

  it('reports an error and skips onPayload on invalid JSON', async () => {
    const readFile = vi.fn().mockResolvedValue('{not json');
    const onPayload = vi.fn();
    const onStatus = vi.fn();

    startFileWatching(readFile, 1000, { onPayload, onStatus });
    await vi.advanceTimersByTimeAsync(1000);

    expect(onPayload).not.toHaveBeenCalled();
    expect(onStatus).toHaveBeenCalledWith('error', expect.any(String));
  });

  it('reports an error when the file read itself rejects (e.g. ENOENT)', async () => {
    const readFile = vi.fn().mockRejectedValue(new Error('ENOENT: no such file'));
    const onPayload = vi.fn();
    const onStatus = vi.fn();

    startFileWatching(readFile, 1000, { onPayload, onStatus });
    await vi.advanceTimersByTimeAsync(1000);

    expect(onPayload).not.toHaveBeenCalled();
    expect(onStatus).toHaveBeenCalledWith('error', 'ENOENT: no such file');
  });

  it('keeps watching after a transient error clears', async () => {
    const good = { v: LIVE_PROTOCOL_VERSION, players: [] };
    const readFile = vi.fn()
      .mockResolvedValueOnce('{bad')
      .mockResolvedValue(JSON.stringify(good));
    const onPayload = vi.fn();
    const onStatus = vi.fn();

    startFileWatching(readFile, 1000, { onPayload, onStatus });
    await vi.advanceTimersByTimeAsync(1000);
    expect(onPayload).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(onPayload).toHaveBeenCalledWith(good);
  });
});
