const DB_NAME = "voicenotes-recordings";
const STORE_NAME = "recordings";
const LAST_KEY = "last-unsaved";

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, callback) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      const request = callback(store);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function saveLastRecording(recording) {
  await withStore("readwrite", (store) => store.put(recording, LAST_KEY));
}

export async function loadLastRecording() {
  try {
    return await withStore("readonly", (store) => store.get(LAST_KEY));
  } catch {
    return null;
  }
}

export async function clearLastRecording() {
  try {
    await withStore("readwrite", (store) => store.delete(LAST_KEY));
  } catch {}
}
