import { getDb, STORE_ENTRIES } from './db'
import type { Entry } from '@/domain/types'

export async function getEntry(date: string): Promise<Entry | undefined> {
  const db = await getDb()
  return db.get(STORE_ENTRIES, date)
}

export async function putEntry(entry: Entry): Promise<void> {
  const db = await getDb()
  await db.put(STORE_ENTRIES, entry)
}

export async function deleteEntry(date: string): Promise<void> {
  const db = await getDb()
  await db.delete(STORE_ENTRIES, date)
}

export async function clearAllEntries(): Promise<void> {
  const db = await getDb()
  await db.clear(STORE_ENTRIES)
}
