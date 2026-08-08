import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveFileHandle, loadFileHandle, ensureReadPermission } from './fileHandleStore';

function fakeHandle(name: string) {
  return { name } as unknown as FileSystemFileHandle;
}

describe('saveFileHandle / loadFileHandle', () => {
  beforeEach(() => {
    // Fresh in-memory IndexedDB per test — the store persists across tests
    // otherwise, since it's the same global by default.
    globalThis.indexedDB = new IDBFactory();
  });

  it('returns null when nothing has been saved yet', async () => {
    expect(await loadFileHandle()).toBeNull();
  });

  it('round-trips a saved handle', async () => {
    const handle = fakeHandle('pzmap-live.json');
    await saveFileHandle(handle);
    const loaded = await loadFileHandle();
    expect(loaded).toEqual(handle);
  });

  it('overwrites a previously saved handle', async () => {
    await saveFileHandle(fakeHandle('first.json'));
    await saveFileHandle(fakeHandle('second.json'));
    const loaded = await loadFileHandle();
    expect((loaded as unknown as { name: string }).name).toBe('second.json');
  });
});

describe('ensureReadPermission', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('returns true without prompting when permission is already granted', async () => {
    const queryPermission = vi.fn().mockResolvedValue('granted');
    const requestPermission = vi.fn();
    const handle = { queryPermission, requestPermission } as unknown as FileSystemFileHandle;

    expect(await ensureReadPermission(handle)).toBe(true);
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('prompts and returns the result when permission is not yet granted', async () => {
    const queryPermission = vi.fn().mockResolvedValue('prompt');
    const requestPermission = vi.fn().mockResolvedValue('granted');
    const handle = { queryPermission, requestPermission } as unknown as FileSystemFileHandle;

    expect(await ensureReadPermission(handle)).toBe(true);
    expect(requestPermission).toHaveBeenCalledWith({ mode: 'read' });
  });

  it('returns false when the user denies the permission prompt', async () => {
    const queryPermission = vi.fn().mockResolvedValue('prompt');
    const requestPermission = vi.fn().mockResolvedValue('denied');
    const handle = { queryPermission, requestPermission } as unknown as FileSystemFileHandle;

    expect(await ensureReadPermission(handle)).toBe(false);
  });
});
