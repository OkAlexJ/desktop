import type { PlayRecord } from "../types";

/**
 * Listening history lives in its own IndexedDB database so it never touches the
 * cache schema in linerDb (and survives "clear cache"). Falls back to memory
 * when IndexedDB is missing (tests, broken profiles).
 */
const DB_NAME = "liner_stats_v1";
const DB_VERSION = 1;
const STORE = "plays";

class StatsDb {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private mem = new Map<string, PlayRecord>();

  private get supported(): boolean {
    return typeof indexedDB !== "undefined";
  }

  private open(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      let request: IDBOpenDBRequest;
      try {
        request = indexedDB.open(DB_NAME, DB_VERSION);
      } catch (err) {
        reject(err);
        return;
      }
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "id" });
          store.createIndex("playedAt", "playedAt", { unique: false });
          store.createIndex("trackId", "trackId", { unique: false });
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onclose = () => (this.dbPromise = null);
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

  private async run<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
    if (!this.supported) return null;
    try {
      const db = await this.open();
      return await new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = op(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error("tx aborted"));
      });
    } catch {
      this.dbPromise = null;
      return null;
    }
  }

  async putPlay(record: PlayRecord): Promise<void> {
    this.mem.set(record.id, record);
    await this.run("readwrite", (store) => store.put(record));
  }

  /** Every play, oldest first. */
  async getAllPlays(): Promise<PlayRecord[]> {
    const rows = await this.run("readonly", (store) => store.index("playedAt").getAll() as IDBRequest<PlayRecord[]>);
    const merged = new Map<string, PlayRecord>();
    for (const r of rows ?? []) merged.set(r.id, r);
    for (const r of this.mem.values()) merged.set(r.id, r);
    return [...merged.values()].sort((a, b) => a.playedAt - b.playedAt);
  }

  /** Rejects when the stored rows couldn't be deleted, so callers don't report a clear that didn't happen. */
  async clear(): Promise<void> {
    this.mem.clear();
    if (!this.supported) return;
    const result = await this.run("readwrite", (store) => store.clear());
    if (result === null) throw new Error("Couldn't clear the listening history");
  }
}

export const statsDb = new StatsDb();
