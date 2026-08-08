const DB_NAME = 'pzmap-live';
const STORE_NAME = 'handles';
const HANDLE_KEY = 'live-file';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveFileHandle(handle: FileSystemFileHandle): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(handle, HANDLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadFileHandle(): Promise<FileSystemFileHandle | null> {
  const db = await openDb();
  const handle = await new Promise<FileSystemFileHandle | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(HANDLE_KEY);
    req.onsuccess = () => resolve((req.result as FileSystemFileHandle | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return handle;
}

// Safe to call anytime — never prompts. Use for a silent, automatic resume
// (e.g. on page load): browsers don't reliably grant requestPermission()
// outside a user gesture, so checking without asking is the only thing that
// can run there without risking a silently-broken permission request.
export async function hasReadPermission(handle: FileSystemFileHandle): Promise<boolean> {
  return (await handle.queryPermission({ mode: 'read' })) === 'granted';
}

// May show the browser's permission prompt — only call from inside a click
// handler or other user gesture.
export async function ensureReadPermission(handle: FileSystemFileHandle): Promise<boolean> {
  if (await hasReadPermission(handle)) return true;
  return (await handle.requestPermission({ mode: 'read' })) === 'granted';
}
