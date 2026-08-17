import { openDB, type IDBPDatabase } from 'idb'

const DB_NAME = 'clocked'
const DB_VERSION = 3
export const STORE_SETTINGS = 'settings'
export const STORE_WORKTIME = 'worktime'
export const STORE_HISTORY = 'history'

let dbPromise: Promise<IDBPDatabase> | null = null

export function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 2) {
          if (db.objectStoreNames.contains('entries')) {
            db.deleteObjectStore('entries')
          }
          if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
            db.createObjectStore(STORE_SETTINGS)
          }
          if (!db.objectStoreNames.contains(STORE_WORKTIME)) {
            db.createObjectStore(STORE_WORKTIME)
          }
        }
        if (oldVersion < 3) {
          if (!db.objectStoreNames.contains(STORE_HISTORY)) {
            db.createObjectStore(STORE_HISTORY)
          }
        }
      },
    })
  }
  return dbPromise
}
