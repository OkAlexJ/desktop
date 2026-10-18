/**
 * Song translations live in their own IndexedDB database, keyed by provider, track,
 * target language and a hash of the lyrics text (so a different lyrics source misses).
 * Falls back to memory when IndexedDB is missing (tests, broken profiles).
 */
const DB_NAME = "liner_lyrics_translations_v1";
const DB_VERSION = 1;
const STORE = "songs";
const MAX_ENTRIES = 400;

export interface CachedTranslation {
  key: string;
  // original line text -> translated text ("" when the service returned nothing)
  lines: Record<string, string>;
  sameLanguage?: boolean;
  savedAt: number;
}

export interface TranslationCacheLike {
  get(key: string): Promise<CachedTranslation | null>;
  set(entry: CachedTranslation): Promise<void>;
}

// small stable string hash (FNV-1a), enough to tell lyric versions apart
export function hashText(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function translationCacheKey(provider: string, trackId: string, target: string, lines: string[]): string {
  return `${provider}|${trackId}|${target}|${hashText(lines.join("\n"))}`;
}

export class MemoryTranslationCache implements TranslationCacheLike {
  private map = new Map<string, CachedTranslation>();
  async get(key: string) {
    return this.map.get(key) ?? null;
  }
  async set(entry: CachedTranslation) {
    this.map.set(entry.key, entry);
  }
}

class IdbTranslationCache implements TranslationCacheLike {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private mem = new MemoryTranslationCache();

  private get supported(): boolean {
    return typeof indexedDB !== "undefined";
  }

  private open(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "key" });
          store.createIndex("savedAt", "savedAt", { unique: false });
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          try {
            db.close();
          } catch {}
          this.dbPromise = null;
        };
        resolve(db);
      };
      request.onerror = () => reject(request.error);
    }).catch((err) => {
      this.dbPromise = null;
      throw err;
    });
    return this.dbPromise;
  }

  async get(key: string): Promise<CachedTranslation | null> {
    const hit = await this.mem.get(key);
    if (hit || !this.supported) return hit;
    try {
      const db = await this.open();
      const entry = await new Promise<CachedTranslation | null>((resolve, reject) => {
        const req = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
        req.onsuccess = () => resolve((req.result as CachedTranslation) ?? null);
        req.onerror = () => reject(req.error);
      });
      if (entry) await this.mem.set(entry);
      return entry;
    } catch {
      return null;
    }
  }

  async set(entry: CachedTranslation): Promise<void> {
    await this.mem.set(entry);
    if (!this.supported) return;
    try {
      const db = await this.open();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        const store = tx.objectStore(STORE);
        store.put(entry);
        // drop the oldest songs once the cache grows past its cap
        const countReq = store.count();
        countReq.onsuccess = () => {
          let excess = countReq.result - MAX_ENTRIES;
          if (excess <= 0) return;
          const cursorReq = store.index("savedAt").openCursor();
          cursorReq.onsuccess = () => {
            const cursor = cursorReq.result;
            if (!cursor || excess <= 0) return;
            cursor.delete();
            excess--;
            cursor.continue();
          };
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error("tx aborted"));
      });
    } catch {
      // memory copy still serves this session
    }
  }
}

export const translationCache: TranslationCacheLike = new IdbTranslationCache();
