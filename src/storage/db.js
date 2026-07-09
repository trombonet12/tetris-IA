// Promise wrapper over IndexedDB. Database: 'tetris-ia'.
// Stores: models, sessions, replays, hallOfFame.

const DB_NAME = 'tetris-ia';
const DB_VERSION = 1;

let dbPromise = null;

export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      if (e.oldVersion < 1) {
        const models = db.createObjectStore('models', { keyPath: 'id' });
        models.createIndex('createdAt', 'createdAt');
        models.createIndex('bestFitness', 'bestFitness');
        models.createIndex('name', 'name');
        const sessions = db.createObjectStore('sessions', { keyPath: 'id' });
        sessions.createIndex('updatedAt', 'updatedAt');
        const replays = db.createObjectStore('replays', { keyPath: 'id' });
        replays.createIndex('createdAt', 'createdAt');
        replays.createIndex('mode', 'mode');
        const hof = db.createObjectStore('hallOfFame', { keyPath: 'id' });
        hof.createIndex('generation', 'generation');
        hof.createIndex('sessionId', 'sessionId');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(db, store, mode, fn) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, mode);
    const objectStore = transaction.objectStore(store);
    const result = fn(objectStore);
    transaction.oncomplete = () => resolve(result?.result ?? result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error('transaction aborted'));
  });
}

export async function dbPut(store, value) {
  const db = await openDb();
  try {
    return await tx(db, store, 'readwrite', (s) => s.put(value));
  } catch (err) {
    if (err?.name === 'QuotaExceededError') {
      try {
        await navigator.storage?.persist?.();
      } catch {
        /* best effort */
      }
      throw new Error('Almacenamiento lleno: libera espacio eliminando modelos o sesiones antiguas');
    }
    throw err;
  }
}

export async function dbGet(store, key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function dbGetAll(store) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror = () => reject(req.error);
  });
}

export async function dbDelete(store, key) {
  const db = await openDb();
  return tx(db, store, 'readwrite', (s) => s.delete(key));
}

export async function dbClear(store) {
  const db = await openDb();
  return tx(db, store, 'readwrite', (s) => s.clear());
}

export function makeId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
