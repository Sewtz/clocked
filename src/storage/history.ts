import { getDb, STORE_HISTORY } from './db'
import type { Worktime } from '@/domain/types'

export async function getHistoryDay(date: string): Promise<Worktime | null> {
  const db = await getDb()
  return (await db.get(STORE_HISTORY, date)) ?? null
}

export async function putHistoryDay(worktime: Worktime): Promise<void> {
  const db = await getDb()
  await db.put(STORE_HISTORY, worktime, worktime.date)
}

export async function deleteHistoryDay(date: string): Promise<void> {
  const db = await getDb()
  await db.delete(STORE_HISTORY, date)
}

export async function getAllHistory(): Promise<Worktime[]> {
  const db = await getDb()
  return await db.getAll(STORE_HISTORY)
}

export async function getHistoryRange(
  startYMD: string,
  endYMD: string,
): Promise<Record<string, Worktime>> {
  const db = await getDb()
  const range = IDBKeyRange.bound(startYMD, endYMD)
  const all = await db.getAll(STORE_HISTORY, range)
  const out: Record<string, Worktime> = {}
  for (const w of all) out[w.date] = w
  return out
}

export async function clearHistory(): Promise<void> {
  const db = await getDb()
  await db.clear(STORE_HISTORY)
}