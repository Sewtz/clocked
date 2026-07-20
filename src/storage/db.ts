import { openDB, type IDBPDatabase } from 'idb'

const DB_NAME = 'clocked'
const DB_VERSION = 1
const STORE_ENTRIES = 'entries'

export { STORE_ENTRIES }

let dbPromise: Promise<IDBPDatabase> | null = null

export function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_ENTRIES)) {
          db.createObjectStore(STORE_ENTRIES, { keyPath: 'date' })
        }
      },
    })
  }
  return dbPromise
}
