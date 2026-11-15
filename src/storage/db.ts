import { openDB, type IDBPDatabase } from 'idb'
import { migratePunchesToEvents } from './migrate'

const DB_NAME = 'clocked'
export const DB_VERSION = 4
export const STORE_SETTINGS = 'settings'
export const STORE_WORKTIME = 'worktime'
export const STORE_HISTORY = 'history'

let dbPromise: Promise<IDBPDatabase> | null = null

export function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, _newVersion, tx) {
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
        if (oldVersion >= 2 && oldVersion < 4) {
          // v2/v3 stored days as { punches }; v4 stores { events }. On failure,
          // abort so the DB stays at the old version with data untouched.
          migratePunchesToEvents(tx, [STORE_WORKTIME, STORE_HISTORY]).catch((err: unknown) => {
            console.error('clocked: v4 migration failed, aborting upgrade', err)
            tx.abort()
          })
        }
      },
    })
  }
  return dbPromise
}

/** Test-only: close the connection and forget it so the next getDb() reopens. */
export async function resetDbForTests(): Promise<void> {
  if (dbPromise) (await dbPromise).close()
  dbPromise = null
}
