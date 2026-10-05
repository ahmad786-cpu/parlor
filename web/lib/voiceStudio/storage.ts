'use client';

// Takes are kept in this browser (IndexedDB) so recording can span several sessions.
// Nothing is uploaded; "Download dataset" is how the recordings leave the browser.
// Details and audio live in separate stores so the page can list progress without loading
// every recording into memory.

export type TakeMeta = { index: number; seconds: number; ok: boolean; issues: string[]; at: number };

const DB = 'parlor-voice-studio';
const META = 'meta';
const AUDIO = 'audio';

let dbPromise: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  return (dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(META, { keyPath: 'index' });
      req.result.createObjectStore(AUDIO); // key: sentence index, value: WAV bytes
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveTake(meta: TakeMeta, wav: Uint8Array<ArrayBuffer>) {
  const tx = (await open()).transaction([META, AUDIO], 'readwrite');
  tx.objectStore(META).put(meta);
  tx.objectStore(AUDIO).put(wav, meta.index);
  await done(tx);
}

export async function deleteTake(index: number) {
  const tx = (await open()).transaction([META, AUDIO], 'readwrite');
  tx.objectStore(META).delete(index);
  tx.objectStore(AUDIO).delete(index);
  await done(tx);
}

export async function listTakes(): Promise<TakeMeta[]> {
  return request((await open()).transaction(META).objectStore(META).getAll() as IDBRequest<TakeMeta[]>);
}

export async function loadAudio(index: number): Promise<Uint8Array<ArrayBuffer> | null> {
  return (await request((await open()).transaction(AUDIO).objectStore(AUDIO).get(index))) ?? null;
}

export async function clearTakes() {
  const tx = (await open()).transaction([META, AUDIO], 'readwrite');
  tx.objectStore(META).clear();
  tx.objectStore(AUDIO).clear();
  await done(tx);
}
