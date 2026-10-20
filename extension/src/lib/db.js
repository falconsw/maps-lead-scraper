// Small IndexedDB layer. Stores:
//   sessions: { id, query, startedAt, endedAt, count }
//   places:   one row per (sessionId, key), the parsed record

const DB_NAME = 'maps-lead-scraper';
const DB_VERSION = 2;

let dbPromise;

function openDb() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      if (event.oldVersion < 1) {
        db.createObjectStore('sessions', { keyPath: 'id' });
        db.createObjectStore('places', { keyPath: ['sessionId', 'key'] }).createIndex('bySession', 'sessionId');
      }
      // v1 also had a website cache; the extension no longer leaves Google Maps.
      if (event.oldVersion === 1) {
        if (db.objectStoreNames.contains('sites')) db.deleteObjectStore('sites');
        const places = req.transaction.objectStore('places');
        if (places.indexNames.contains('byDomain')) places.deleteIndex('byDomain');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

const done = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

async function run(storeNames, mode, fn) {
  const db = await openDb();
  const tx = db.transaction(storeNames, mode);
  const committed = new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  const result = await fn(tx);
  await committed;
  return result;
}

export const putSession = (session) => run('sessions', 'readwrite', (tx) => done(tx.objectStore('sessions').put(session)));

export const getSession = (id) => run('sessions', 'readonly', (tx) => done(tx.objectStore('sessions').get(id)));

export async function listSessions() {
  const all = await run('sessions', 'readonly', (tx) => done(tx.objectStore('sessions').getAll()));
  return all.sort((a, b) => b.startedAt - a.startedAt);
}

export const getSessionPlaces = (sessionId) =>
  run('places', 'readonly', (tx) => done(tx.objectStore('places').index('bySession').getAll(sessionId)));

// Inserts new places and merges non-empty fields into existing ones.
// Returns the rows that were not in the session before.
export function upsertPlaces(sessionId, records) {
  return run('places', 'readwrite', async (tx) => {
    const store = tx.objectStore('places');
    const added = [];
    for (const rec of records) {
      const existing = await done(store.get([sessionId, rec.key]));
      if (existing) {
        const merged = { ...existing };
        for (const [k, v] of Object.entries(rec)) if (v !== '' && v !== null && v !== undefined) merged[k] = v;
        store.put(merged);
      } else {
        const row = { ...rec, sessionId, capturedAt: Date.now() };
        store.put(row);
        added.push(row);
      }
    }
    return added;
  });
}

export function deleteSession(sessionId) {
  return run(['sessions', 'places'], 'readwrite', async (tx) => {
    tx.objectStore('sessions').delete(sessionId);
    const keys = await done(tx.objectStore('places').index('bySession').getAllKeys(sessionId));
    for (const key of keys) tx.objectStore('places').delete(key);
  });
}
