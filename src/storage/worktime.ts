import { getDb, STORE_WORKTIME } from './db'
import type { Worktime } from '@/domain/types'

export async function getWorktime(): Promise<Worktime | null> {
  const db = await getDb()
  return (await db.get(STORE_WORKTIME, 'worktime')) ?? null
}

export async function putWorktime(worktime: Worktime): Promise<void> {
  const db = await getDb()
  await db.put(STORE_WORKTIME, worktime, 'worktime')
}

export async function clearWorktime(): Promise<void> {
  const db = await getDb()
  await db.delete(STORE_WORKTIME, 'worktime')
}
