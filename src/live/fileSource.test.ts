import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startPolling } from './fileSource';
import { LIVE_PROTOCOL_VERSION } from './protocol';

function fakeHandle(textForCall: (call: number) => string) {
  let call = 0;
  return {
    getFile: async () => ({
      text: async () => textForCall(call++),
    }),
  } as unknown as FileSystemFileHandle;
}

describe('startPolling', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('reads on an interval and reports valid payloads', async () => {
    const payload = { v: LIVE_PROTOCOL_VERSION, players: [] };
    const handle = fakeHandle(() => JSON.stringify(payload));
    const onPayload = vi.fn();
    const onStatus = vi.fn();

    const stop = startPolling(handle, 1000, { onPayload, onStatus });
    await vi.advanceTimersByTimeAsync(1000);
    expect(onPayload).toHaveBeenCalledWith(payload);
    expect(onStatus).toHaveBeenCalledWith('reading');

    await vi.advanceTimersByTimeAsync(1000);
    expect(onPayload).toHaveBeenCalledTimes(2);

    stop();
    await vi.advanceTimersByTimeAsync(2000);
    expect(onPayload).toHaveBeenCalledTimes(2);
  });

  it('reports an error and skips onPayload on invalid JSON', async () => {
    const handle = fakeHandle(() => '{not json');
    const onPayload = vi.fn();
    const onStatus = vi.fn();

    startPolling(handle, 1000, { onPayload, onStatus });
    await vi.advanceTimersByTimeAsync(1000);

    expect(onPayload).not.toHaveBeenCalled();
    expect(onStatus).toHaveBeenCalledWith('error', expect.any(String));
  });

  it('reports an error and skips onPayload on a payload that fails validation', async () => {
    const handle = fakeHandle(() => JSON.stringify({ v: 99, players: [] }));
    const onPayload = vi.fn();
    const onStatus = vi.fn();

    startPolling(handle, 1000, { onPayload, onStatus });
    await vi.advanceTimersByTimeAsync(1000);

    expect(onPayload).not.toHaveBeenCalled();
    expect(onStatus).toHaveBeenCalledWith('error', expect.any(String));
  });

  it('keeps polling after a transient error clears', async () => {
    const good = { v: LIVE_PROTOCOL_VERSION, players: [] };
    const handle = fakeHandle((call) => (call === 0 ? '{bad' : JSON.stringify(good)));
    const onPayload = vi.fn();
    const onStatus = vi.fn();

    startPolling(handle, 1000, { onPayload, onStatus });
    await vi.advanceTimersByTimeAsync(1000);
    expect(onPayload).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(onPayload).toHaveBeenCalledWith(good);
  });
});
